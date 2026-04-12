# Canton Private Oracle

A privacy-preserving, Chainlink-style oracle network built natively on the Canton blockchain. This project provides a resilient and front-running resistant mechanism for dApps to consume external data feeds (like asset prices) without revealing sensitive information on the ledger.

Unlike public oracles where price updates are broadcast to all network participants, the Canton Private Oracle ensures that price data is only visible to the oracle operator and the specific dApps that have subscribed to a feed.

---

## Key Features

*   **Privacy-Preserving by Design**: Price updates are encapsulated in private contracts. Only the oracle operator and authorized subscribers can view the aggregated price. Individual provider submissions are visible only to the provider and the aggregator, ensuring source anonymity.
*   **Front-Running Resistant**: Since oracle price updates are not public events on the ledger, malicious actors cannot observe price changes and front-run dApp transactions that depend on them.
*   **Decentralized & Resilient**: Aggregates prices from multiple independent providers to prevent single points of failure and manipulation. The aggregation logic uses a trimmed median to discard outliers.
*   **On-Chain Aggregation**: A trusted aggregator contract atomically collects submissions and computes the final price, ensuring data integrity and consistency.
*   **Subscription-Based Access**: dApps formally subscribe to specific price feeds. Access is governed by a `Subscription` contract, which acts as a capability token for fetching price data.
*   **Atomic "Pull" Model**: Consuming contracts actively `Fetch` the latest price when needed as part of their own transaction. This pull-based mechanism guarantees that the price data is fresh and atomically composed with the consuming business logic.

## How It Works

The oracle operates through a set of interconnected Daml contracts, managed by distinct parties with specific roles.



1.  **Setup**: The `Operator` deploys a `Master` contract, which serves as the central hub for the oracle network.
2.  **Provider Onboarding**: The `Operator` invites `Providers` to the network. Upon acceptance, each `Provider` receives a `ProviderRole` contract, authorizing them to submit data.
3.  **Feed Creation**: The `Operator` creates a `PriceFeed` contract for a specific asset pair (e.g., ETH/USD). This contract acts as the collection point for submissions.
4.  **dApp Subscription**: A `Consumer` (representing a dApp) requests a subscription to a specific feed by exercising a choice on the `Master` contract.
5.  **Approval**: The `Operator` approves the request, creating a `Subscription` contract shared between the `Operator` and the `Consumer`. This contract is the `Consumer`'s key to accessing the price feed.
6.  **Price Submission**: Each authorized `Provider` submits price data by creating `PriceSubmission` contracts, which are only visible to the `Provider` and the `Aggregator`.
7.  **Aggregation**: Periodically, the `Aggregator` triggers the aggregation logic on the `PriceFeed` contract. It fetches all recent submissions, calculates a trimmed median, and archives the submissions.
8.  **Price Update**: The `Aggregator` creates or updates a single `Price` contract containing the latest aggregated price and timestamp. This contract's observers are the `Operator` and **all currently subscribed `Consumers`** for that feed.
9.  **Consumption**: The `Consumer`'s dApp contract can now use its `Subscription` contract ID to atomically `Fetch` the latest price data within its own transaction.

## Quickstart for dApp Developers

Integrating your dApp with the Canton Private Oracle is straightforward.

### Step 1: Add the Oracle Dependency

First, build the oracle project to generate a DAR (Daml Archive). Then, add the path to the DAR file to your dApp's `daml.yaml` dependencies.

```yaml
# Your dApp's daml.yaml
sdk-version: 3.4.0
name: my-defi-dapp
version: 0.1.0
source: daml
dependencies:
  - daml-prim
  - daml-stdlib
  - daml-script
  # Add the path to the oracle DAR
  - ../canton-private-oracle/.daml/dist/canton-private-oracle-0.1.0.dar
```

### Step 2: Import Oracle Modules

In your Daml smart contract, import the necessary modules. You'll primarily need the `Subscription` module.

```daml
module MyDeFiApp.Contract where

import Daml.Script
import DA.Time (addRelTime, minutes)

import Canton.PrivateOracle.Subscription qualified as Oracle
import Canton.PrivateOracle.Types (PriceData)
```

### Step 3: Subscribe to a Price Feed

Subscription is a one-time setup step, typically performed via a Daml Script or an off-chain application UI. The dApp's operator (`consumerParty`) must find the oracle's `Master` contract on the ledger and exercise the `RequestSubscription` choice. The oracle `Operator` will then approve this request, creating the `Subscription` contract.

### Step 4: Fetch the Price in Your Smart Contract

Your contract should hold the `ContractId` of its `Subscription` contract. To use the oracle price, you simply `exercise` the `Fetch` choice on that `ContractId`. This atomically brings the latest `PriceData` into your transaction's context.

Here is an example of a simple derivatives contract that settles based on the oracle price.

```daml
template Derivative
  with
    owner: Party
    counterparty: Party
    notional: Decimal
    oracleSubscription: ContractId Oracle.Subscription
  where
    signatory owner, counterparty

    choice Settle : ContractId SettledDerivative
      controller owner
      do
        -- 1. Atomically fetch the latest price from the oracle
        priceData <- exercise oracleSubscription Oracle.Fetch {}

        -- 2. (Optional but recommended) Validate the price freshness
        let sixtyMinutesAgo = addRelTime now (minutes (-60))
        assertMsg "Price is stale. Refusing to settle." (priceData.timestamp >= sixtyMinutesAgo)

        -- 3. Use the price in your business logic
        let settlementAmount = notional * priceData.price
        -- Your settlement logic here...

        create SettledDerivative with
          owner
          counterparty
          settlementAmount
          settlementPrice = priceData.price
          settlementTimestamp = priceData.timestamp
```

## Running the Project Locally

1.  **Install DPM**:
    ```sh
    curl https://get.digitalasset.com/install/install.sh | sh
    ```

2.  **Build the project**:
    ```sh
    dpm build
    ```

3.  **Start a local Canton ledger**:
    ```sh
    dpm sandbox
    ```

4.  **Run the setup script**:
    In a separate terminal, run the test script to initialize the oracle with sample data (an operator, providers, a consumer, and an ETH/USD price feed).
    ```sh
    dpm script \
      --dar .daml/dist/canton-private-oracle-0.1.0.dar \
      --script-name Canton.PrivateOracle.Test.Setup:setup
    ```
    This script will print the parties and contract IDs it creates, which you can use for further interaction.

## Project Structure

*   `daml/Canton/PrivateOracle/Master.daml`: The main entry point for managing the oracle, onboarding providers, and handling subscriptions.
*   `daml/Canton/PrivateOracle/Feed.daml`: Defines the `PriceFeed`, `PriceSubmission`, and the core aggregation logic.
*   `daml/Canton/PrivateOracle/Subscription.daml`: Defines the `Subscription` contract and the `Fetch` choice used by consumers.
*   `daml/Canton/PrivateOracle/Roles.daml`: Defines the `OperatorRole` and `ProviderRole` contracts.
*   `daml/Canton/PrivateOracle/Types.daml`: Contains common data types used across the project, such as `AssetPair` and `PriceData`.
*   `daml/Canton/PrivateOracle/Test/`: Daml Script files for testing and setting up development scenarios.