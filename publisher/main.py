# publisher/main.py

# Required packages:
# pip install requests PyJWT python-dotenv schedule
#
# This script acts as a price provider for the Canton private oracle network.
# It fetches prices from an external API (e.g., CoinGecko) and submits them
# to the ledger by exercising a choice on a `ProviderRole` contract.
#
# Configuration is managed via environment variables in a `.env` file.

import os
import requests
import time
import logging
from datetime import datetime, timezone
import jwt
import schedule
from dotenv import load_dotenv
from decimal import Decimal, getcontext

# Set precision for Decimal calculations
getcontext().prec = 28

# --- Configuration ---
# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Canton participant configuration
CANTON_LEDGER_URL = os.getenv("CANTON_LEDGER_URL", "http://localhost:7575")
JWT_SECRET = os.getenv("JWT_SECRET")
# The Ledger ID is often 'sandbox' for local development
LEDGER_ID = os.getenv("LEDGER_ID", "sandbox")

# Oracle provider configuration
PROVIDER_PARTY_ID = os.getenv("PROVIDER_PARTY_ID")
AGGREGATOR_PARTY_ID = os.getenv("AGGREGATOR_PARTY_ID")
APPLICATION_ID = "CantonPrivateOraclePublisher"

# Price feed configuration
# Comma-separated list of asset pairs, e.g., "BTC/USD,ETH/USD"
PRICE_PAIRS_STR = os.getenv("PRICE_PAIRS", "BTC/USD,ETH/USD")
PRICE_PAIRS = [pair.strip() for pair in PRICE_PAIRS_STR.split(',')]
SUBMIT_INTERVAL_SECONDS = int(os.getenv("SUBMIT_INTERVAL_SECONDS", 30))

# External API configuration (using CoinGecko as an example)
# Maps our asset pair format to CoinGecko API IDs
COINGECKO_ID_MAP = {
    "BTC/USD": "bitcoin",
    "ETH/USD": "ethereum",
    "SOL/USD": "solana",
    "ADA/USD": "cardano",
    "XRP/USD": "ripple"
}
COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price"


# --- Helper Functions ---

def validate_config():
    """Validates that all necessary environment variables are set."""
    required_vars = [
        "JWT_SECRET",
        "PROVIDER_PARTY_ID",
        "AGGREGATOR_PARTY_ID"
    ]
    missing_vars = [var for var in required_vars if not globals()[var]]
    if missing_vars:
        msg = f"Missing required environment variables: {', '.join(missing_vars)}"
        logging.error(msg)
        raise ValueError(msg)
    logging.info("Configuration validated successfully.")

def generate_jwt(party_id: str) -> str:
    """Generates a JWT for authenticating with the Canton JSON API."""
    payload = {
        "https://daml.com/ledger-api": {
            "ledgerId": LEDGER_ID,
            "applicationId": APPLICATION_ID,
            "actAs": [party_id]
        }
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def fetch_external_price(asset_pair: str) -> Decimal | None:
    """Fetches the price for a given asset pair from CoinGecko."""
    if asset_pair not in COINGECKO_ID_MAP:
        logging.warning(f"No CoinGecko ID mapping for asset pair: {asset_pair}")
        return None

    coin_id = COINGECKO_ID_MAP[asset_pair]
    currency = asset_pair.split('/')[1].lower()

    params = {
        "ids": coin_id,
        "vs_currencies": currency
    }
    try:
        response = requests.get(COINGECKO_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        price = data.get(coin_id, {}).get(currency)
        if price is None:
            logging.error(f"Price not found in CoinGecko response for {asset_pair}")
            return None
        
        price_decimal = Decimal(price)
        logging.info(f"Fetched external price for {asset_pair}: {price_decimal}")
        return price_decimal
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching price from CoinGecko for {asset_pair}: {e}")
        return None

def find_provider_role_contract(asset_pair: str) -> dict | None:
    """Queries the ledger to find the ProviderRole contract for a specific asset pair."""
    token = generate_jwt(PROVIDER_PARTY_ID)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    query = {
        "templateIds": ["Oracle.ProviderStake:ProviderRole"],
        "query": {
            "provider": PROVIDER_PARTY_ID,
            "aggregator": AGGREGATOR_PARTY_ID,
        }
    }
    try:
        response = requests.post(f"{CANTON_LEDGER_URL}/v1/query", json=query, headers=headers)
        response.raise_for_status()
        contracts = response.json().get("result", [])

        # Filter in Python for the correct asset pair
        for contract in contracts:
            if contract.get("payload", {}).get("assetPair") == asset_pair:
                logging.info(f"Found ProviderRole contract for {asset_pair}: {contract['contractId']}")
                return contract
        
        logging.warning(f"No active ProviderRole contract found for asset pair: {asset_pair}")
        return None
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to query for ProviderRole contract: {e}")
        return None

def submit_price_to_ledger(contract_id: str, asset_pair: str, price: Decimal):
    """Exercises the SubmitPrice choice on the ProviderRole contract."""
    token = generate_jwt(PROVIDER_PARTY_ID)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Daml Decimals require a string representation. We format it to 10 decimal places.
    daml_price_str = f"{price:.10f}"
    
    # Daml Time requires an ISO 8601 format with 'Z' for UTC.
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    payload = {
        "templateId": "Oracle.ProviderStake:ProviderRole",
        "contractId": contract_id,
        "choice": "SubmitPrice",
        "argument": {
            "newPrice": daml_price_str,
            "observationTime": timestamp
        }
    }
    try:
        response = requests.post(f"{CANTON_LEDGER_URL}/v1/exercise", json=payload, headers=headers)
        response.raise_for_status()
        logging.info(f"Successfully submitted price {daml_price_str} for {asset_pair} at {timestamp}")
        return response.json()
    except requests.exceptions.HTTPError as e:
        logging.error(f"Failed to submit price for {asset_pair}. Status: {e.response.status_code}, Body: {e.response.text}")
    except requests.exceptions.RequestException as e:
        logging.error(f"Network error while submitting price for {asset_pair}: {e}")
    return None


# --- Main Job ---

def submission_job():
    """The main job to be scheduled, fetching and submitting prices for all configured pairs."""
    logging.info("--- Starting price submission cycle ---")
    for pair in PRICE_PAIRS:
        logging.info(f"Processing asset pair: {pair}")
        
        # 1. Fetch external price
        price = fetch_external_price(pair)
        if price is None:
            logging.warning(f"Skipping submission for {pair} due to fetch error.")
            continue
            
        # 2. Find the authorizing contract on the ledger
        role_contract = find_provider_role_contract(pair)
        if role_contract is None:
            logging.warning(f"Skipping submission for {pair} as no ProviderRole contract was found.")
            continue
            
        # 3. Submit the price to the ledger
        submit_price_to_ledger(role_contract["contractId"], pair, price)
    
    logging.info("--- Price submission cycle finished ---")


# --- Entrypoint ---

if __name__ == "__main__":
    try:
        validate_config()
        logging.info(f"Oracle Publisher starting for party: {PROVIDER_PARTY_ID}")
        logging.info(f"Publishing prices for: {PRICE_PAIRS_STR}")
        logging.info(f"Submission interval: {SUBMIT_INTERVAL_SECONDS} seconds")

        # Schedule the job
        schedule.every(SUBMIT_INTERVAL_SECONDS).seconds.do(submission_job)

        # Run the job immediately at startup, then follow the schedule
        submission_job()

        while True:
            schedule.run_pending()
            time.sleep(1)
            
    except ValueError as e:
        # Exit if configuration is invalid
        exit(1)
    except KeyboardInterrupt:
        logging.info("Shutting down Oracle Publisher.")
    except Exception as e:
        logging.critical(f"An unexpected error occurred: {e}", exc_info=True)
        exit(1)