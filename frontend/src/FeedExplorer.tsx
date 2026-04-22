import React from 'react';
import { useStreamQueries } from '@c7/react';
// Assuming `dpm codegen-alpha-typescript` has been run for a package named `canton-private-oracle`
import { Oracle } from '@daml.js/canton-private-oracle-0.1.0';

/**
 * A React component that discovers and displays all available price feeds
 * by querying for the public `FeedMetadata` contracts.
 */
const FeedExplorer: React.FC = () => {
  // Stream all FeedMetadata contracts. These are public directory entries
  // that advertise the availability of a private feed.
  const { contracts, loading } = useStreamQueries(Oracle.Directory.FeedMetadata);

  const tableRows = contracts.map(contract => (
    <tr key={contract.contractId}>
      <td>
        <span className="asset-pair">
          {contract.payload.baseAsset} / {contract.payload.quoteAsset}
        </span>
      </td>
      <td>{contract.payload.description}</td>
      <td>
        <span className="party-id" title={contract.payload.operator}>
          {contract.payload.operator.split('::')[0]}
        </span>
      </td>
      <td>{contract.payload.timeToLiveSecs} seconds</td>
    </tr>
  ));

  const styles = `
    .feed-explorer {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 2rem;
      background-color: #f8f9fa;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
      max-width: 960px;
      margin: 2rem auto;
    }

    .feed-explorer h1 {
      color: #212529;
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      border-bottom: 2px solid #e9ecef;
      padding-bottom: 0.75rem;
    }

    .feed-explorer p {
      color: #6c757d;
      margin-bottom: 2rem;
      line-height: 1.6;
      font-size: 1.1rem;
    }

    .feed-explorer .loading-state, .feed-explorer .empty-state {
      text-align: center;
      color: #6c757d;
      padding: 3rem;
      font-size: 1.1rem;
      background-color: #fff;
      border-radius: 6px;
      border: 1px dashed #ced4da;
    }

    .empty-state p {
      margin-bottom: 0.5rem;
    }

    .feed-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      background-color: #fff;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid #dee2e6;
    }

    .feed-table th, .feed-table td {
      padding: 12px 15px;
      border-bottom: 1px solid #dee2e6;
    }

    .feed-table thead tr {
      background-color: #f8f9fa;
      color: #495057;
      font-weight: 600;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .feed-table tbody tr:last-child td {
      border-bottom: none;
    }

    .feed-table tbody tr:hover {
      background-color: #f1f3f5;
    }

    .asset-pair {
      font-weight: 500;
      font-family: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace;
      color: #0056b3;
    }

    .party-id {
      font-family: monospace;
      font-size: 0.9em;
      background-color: #e9ecef;
      padding: 3px 6px;
      border-radius: 4px;
      cursor: help;
      display: inline-block;
      color: #495057;
    }
  `;

  if (loading) {
    return (
      <div className="feed-explorer">
        <style>{styles}</style>
        <h1>Available Price Feeds</h1>
        <div className="loading-state">Loading available feeds...</div>
      </div>
    );
  }

  return (
    <div className="feed-explorer">
      <style>{styles}</style>
      <h1>Available Price Feeds</h1>
      <p>
        This explorer lists all public price feeds available on the network.
        To consume a price, your dApp must subscribe to a feed.
      </p>
      {contracts.length === 0 ? (
        <div className="empty-state">
          <p>No price feeds found.</p>
          <p>The oracle operator may not have published any feeds yet.</p>
        </div>
      ) : (
        <table className="feed-table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Description</th>
              <th>Operator</th>
              <th>Time-to-Live (TTL)</th>
            </tr>
          </thead>
          <tbody>
            {tableRows}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default FeedExplorer;