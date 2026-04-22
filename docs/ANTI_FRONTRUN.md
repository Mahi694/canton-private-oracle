# Anti-Front-Running by Design: A Technical Proof

This document explains how the Canton Private Oracle's architecture, built on the Canton protocol and Daml smart contracts, inherently prevents the front-running attacks common to oracles on public blockchains.

## 1. The Front-Running Problem on Public Ledgers

On transparent blockchains like Ethereum, all pending transactions reside in a public "mempool" before being included in a block. This transparency creates a critical vulnerability for oracle systems.

A typical front-running attack proceeds as follows:

1.  **Observation:** An attacker (a "front-runner") monitors the mempool for oracle price update transactions. They see a pending transaction from a Chainlink oracle that will update the ETH/USD price from $3,000 to $3,200.
2.  **Anticipation:** The attacker knows that this price change will create arbitrage opportunities on DeFi protocols (e.g., DEXs, lending platforms) that consume this feed.
3.  **Pre-emption:** The attacker submits their own transaction (e.g., a large buy order for ETH on a DEX) with a higher transaction fee ("gas"). This incentivizes miners/validators to include the attacker's transaction in a block *before* the oracle's price update transaction.
4.  **Profit:** The attacker buys ETH at the "stale" price of $3,000. Immediately after, the oracle update transaction is processed, and the on-chain price becomes $3,200. The attacker can then sell their newly acquired ETH for an immediate, risk-free profit.

This is a form of Miner Extractable Value (MEV) that directly extracts value from regular users of the DeFi protocol. It is only possible because of the public nature of the mempool, which leaks critical information about future state changes.

## 2. Canton's Privacy-Preserving Architecture

Canton fundamentally differs from public blockchains. It is a privacy-by-default distributed ledger. There is no public mempool, and transaction contents are not broadcast to the entire network.

Key principles of Canton's privacy model:

*   **Sub-transaction Privacy:** The content of a Daml transaction is only revealed to the *stakeholders* of the contracts involved. Stakeholders are parties explicitly listed as `signatory` or `observer` on a contract.
*   **Encrypted Payloads:** When a transaction is submitted, it is sent to a Sequencer for ordering. However, the Sequencer and other network participants only see encrypted payloads. They can verify the transaction's structure and attestations but cannot read its business logic or data (e.g., the new price).
*   **Private Contract Stores:** Each participant node maintains its own private view of the ledger, containing only the contracts where they are a stakeholder. An external party has zero visibility into the active contracts held by another participant.

## 3. How the Canton Private Oracle Prevents Front-Running

The Canton Private Oracle leverages this native privacy at every stage of the price lifecycle, creating a system where information leakage is impossible.

Let's analyze the transaction flow and the visibility for a would-be front-runner.

**Participants:**
*   `Provider`: Submits price data.
*   `Aggregator`: The oracle operator who collects submissions and computes the final price.
*   `Subscriber`: The dApp that consumes the price feed.
*   `Attacker`: A malicious third party attempting to front-run.

### Step 1: Price Submission

A `Provider` submits their price by creating an `Oracle.Provider.PriceData` contract.

*   **Daml Contract (Simplified):**
    ```daml
    template PriceData
      with
        provider: Party
        aggregator: Party
        price: Decimal
        ...
      where
        signatory provider
        observer aggregator
    ```
*   **Transaction Visibility:**
    *   **Stakeholders:** `Provider`, `Aggregator`.
    *   **Attacker's View:** The attacker is not a stakeholder. They see nothing. They cannot know that a price has been submitted, let alone what its value is.

### Step 2: Price Aggregation and Update

The `Aggregator`'s off-chain logic fetches all `PriceData` contracts for the current round and exercises a choice to create a final, medianized `Oracle.Price` contract. This is an atomic transaction.

*   **Daml Contract (Simplified):**
    ```daml
    template Price
      with
        aggregator: Party
        subscriber: Party
        price: Decimal
        ...
      where
        signatory aggregator
        observer subscriber
    ```
*   **Transaction Visibility:**
    *   **Stakeholders:** `Aggregator`, `Subscriber`.
    *   **Attacker's View:** The attacker is not a stakeholder. They see nothing. They have no knowledge that a new price has been calculated or what its value is. The individual submissions are archived within the same atomic transaction, remaining invisible.

### Step 3: Price Consumption

The `Subscriber` dApp now sees the new `Oracle.Price` contract in its private contract store. It can use this price in its own business logic by exercising a choice on one of its own contracts (e.g., `LiquidateLoan`).

*   **Transaction Visibility:**
    *   **Stakeholders:** The parties to the dApp's contract (e.g., `Subscriber`, `Borrower`). The `Aggregator` might also be an observer if the price is read non-consumingly.
    *   **Attacker's View:** The attacker is not a party to the dApp's protocol contracts. They have no visibility into the dApp's internal operations. They cannot see that the dApp is about to perform a liquidation based on the new price.

## Conclusion: No Information Leakage, No Opportunity

Front-running requires two key pieces of information:
1.  **Knowledge of a pending state change** (e.g., a price update).
2.  **The specific data of that state change** (e.g., the new price).

In the Canton Private Oracle model, a potential attacker has access to **neither**.

| Stage                 | Public Ledger (Ethereum)      | Canton Private Oracle             |
| --------------------- | ----------------------------- | --------------------------------- |
| **Price Submission**  | Public in Mempool             | Private to Provider & Aggregator  |
| **Price Update**      | Public in Mempool             | Private to Aggregator & Subscriber |
| **Price Consumption** | Public in Mempool             | Private to dApp stakeholders      |

By the time any economic consequence of the price update is visible on the network (if ever), the dApp's transaction that relied on that price has already been atomically executed and finalized. The window of opportunity to pre-empt the transaction never opens. The privacy is not a feature added on top; it is a fundamental property of the underlying ledger, making this oracle design front-run resistant by its very nature.