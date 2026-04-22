# Canton Private Oracle - Provider Onboarding Guide

This document outlines the process, requirements, and responsibilities for becoming a price data provider for the Canton Private Oracle network. Our network is designed for high-integrity, privacy-preserving price feeds for dApps on Canton.

## Introduction

As a provider, you play a critical role in the network's security and reliability. You will run a specialized client (the "publisher") that fetches price data from your proprietary sources and submits it to our on-ledger aggregator.

Unlike public blockchain oracles, the Canton Private Oracle ensures that individual price submissions are never revealed to other providers or to the public. The aggregator contract, which you will be a stakeholder on, computes a trimmed median in a way that prevents front-running and protects your data's integrity.

## Core Concepts

*   **Privacy by Default**: Your price submissions are only visible to you and the Oracle Operator. They are not visible to other providers, subscribers, or the public network.
*   **Stake-Weighted Security**: The network's security is backed by a pool of staked assets from all participating providers. This stake serves as a commitment to providing honest and reliable data.
*   **On-Ledger Agreement**: Your relationship with the oracle network is governed by a Daml smart contract, `ProviderStake.Agreement`. This contract manages your stake, permissions, and operational status.

## Requirements

### Technical Requirements

1.  **Canton Participant Node**: A highly available Canton participant node connected to the target Canton network (e.g., DevNet, TestNet, or MainNet).
2.  **Publisher Client**: The ability to run our open-source Python-based publisher client (`publisher/main.py`). This client requires a JWT token for a party hosted on your participant node.
3.  **Reliable Data Source**: Access to a high-quality, low-latency financial data feed for the asset pairs you intend to support.
4.  **Secure Infrastructure**: Your publisher client and Canton participant should be run in a secure, monitored environment to ensure uptime and prevent compromise.

### Staking Requirements

To ensure commitment and deter malicious behavior, each provider must lock a security deposit (stake).

*   **Asset**: USDC (or another approved stablecoin) on Canton.
*   **Minimum Stake**: 10,000 USDC per asset pair feed.
*   **Lock-up Period**: The stake is locked for the duration of your service. A 7-day cooldown period is required upon requesting to unstake.

## Onboarding Process

1.  **Initial Contact**: Reach out to the Oracle Operator team to express interest and begin the vetting process.
2.  **Party Allocation**: Once approved, you will allocate a new `Party` on your Canton participant node. This party will represent your legal entity on the network. Provide this `Party` ID to the Oracle Operator.
3.  **Whitelisting**: The Oracle Operator will add your provider party to the network's whitelist, allowing you to create a stake proposal.
4.  **Create Stake Request**: Using your provider party, you will create a `ProviderStake.Request` contract on the ledger, specifying the Oracle Operator as the counterparty and detailing the asset pairs you will provide.
5.  **Fund Stake**: Transfer the required stake amount (e.g., 10,000 USDC) to the Oracle Operator. This process is typically handled via a Delivery-vs-Payment (DVP) transaction coordinated with the operator.
6.  **Stake Approval**: Upon receipt of the funds, the Oracle Operator will exercise the `Approve` choice on your `ProviderStake.Request`. This consumes the request and creates a long-lived `ProviderStake.Agreement` contract, which formally establishes you as an active provider.
7.  **Configure and Run Publisher**: Configure the `publisher/main.py` client with your party's JWT token and the contract ID of the newly created `ProviderStake.Agreement`. Start the service. It will automatically begin listening for price requests and submitting data.

## Operational Expectations (SLA)

Providers are expected to maintain a high standard of service. Performance is monitored on-ledger.

### Uptime
Providers must maintain a publisher uptime of **99.9%**. The Oracle Aggregator is resilient to a minority of providers being temporarily offline, but consistent downtime will be penalized.

### Liveness
For each price update round (typically every 5 minutes), providers must submit their data within a **90-second window**. Failure to submit within the window is considered a missed report.

### Price Accuracy
Submitted prices must not deviate significantly from the trimmed median calculated in each round.
*   **Deviation Threshold**: **1.5%**
*   If your submitted price is more than 1.5% away from the final aggregated median price, it will be flagged as a deviation. The aggregator is designed to discard such outliers to maintain data quality.

## Slashing Conditions

Failure to meet the SLA will result in the slashing of a portion of your stake. This mechanism protects the network and its users from poor quality or malicious data.

### Liveness Failure (Stale Reporting)
*   **Condition**: Missing more than 12 consecutive reporting rounds (approx. 1 hour of downtime).
*   **Penalty**: A minor slash of **0.1%** of the total stake. This is intended to incentivize prompt recovery from outages.

### Price Deviation (Negligent Reporting)
*   **Condition**: Submitting prices outside the 1.5% deviation threshold for more than 5% of the reports within a 24-hour period.
*   **Penalty**: A moderate slash of **2%** of the total stake. This penalizes providers with misconfigured or low-quality data sources.

### Malicious Reporting (Byzantine Fault)
*   **Condition**: Coordinated attempts to manipulate the price feed, or consistently providing wildly inaccurate data that falls far outside the deviation threshold. Such behavior is reviewed by the Oracle Operator committee.
*   **Penalty**: A severe slash of **100%** of the total stake and immediate removal from the provider set.

## Rewards

Active providers in good standing are compensated for their service.

*   **Source**: Fees collected from dApps subscribing to the price feeds.
*   **Distribution**: Rewards are calculated based on the number of valid (non-slashed) price submissions over a reward period (typically monthly).
*   **Payment**: Rewards are distributed as USDC directly to your designated provider party on Canton.

## Offboarding

Providers can choose to exit the network gracefully.

1.  **Request Unstake**: Exercise the `RequestUnstake` choice on your `ProviderStake.Agreement` contract. This signals your intent to stop providing data and begins the cooldown period. Your publisher will be automatically de-authorized from submitting new prices.
2.  **Cooldown Period**: A **7-day** cooldown period is enforced. This ensures network stability and gives subscribers time to adjust to the change in the provider set.
3.  **Claim Stake**: After the cooldown period ends, you can exercise the `ClaimUnstaked` choice to retrieve your initial stake, minus any penalties incurred during your service. The `ProviderStake.Agreement` contract is archived, and the offboarding is complete.