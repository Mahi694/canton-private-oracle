import React, { useState, useEffect, useMemo } from 'react';
import { DamlLedger, useParty } from '@c7/react';
import { jwt } from '@c7/utils';
import { FeedExplorer } from './FeedExplorer';
import './App.css';

// --- Constants ---

// This should match the ledger ID of your Canton network. 'sandbox' is the default for `dpm sandbox`.
const LEDGER_ID = "sandbox";
// The default URL for the JSON API started with `dpm sandbox`.
const HTTP_JSON_URL = "http://localhost:7575";

// --- Helper Types ---

type Credentials = {
  party: string;
  token: string;
}

// --- Components ---

/**
 * A simple login screen to get user credentials.
 * In a production app, this would be replaced by a proper authentication flow
 * (e.g., OAuth2, SAML, or CIP-0103 wallet integration).
 */
const LoginScreen: React.FC<{ onLogin: (creds: Credentials) => void }> = ({ onLogin }) => {
  const [partyId, setPartyId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyId.trim()) {
      setError("Party ID cannot be empty.");
      return;
    }
    setError(null);
    // For local development, we generate a JWT on the fly.
    // This token has a long expiry and grants actAs claims for the given party.
    // NOTE: The secret 'secret' is insecure and for development only.
    const token = jwt.sign({
      "https://daml.com/ledger-api": {
        ledgerId: LEDGER_ID,
        applicationId: 'canton-private-oracle-ui',
        actAs: [partyId],
      },
    }, "secret", { expiresIn: '12h' });

    onLogin({ party: partyId, token });
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Canton Private Oracle</h1>
        <p>Decentralized, privacy-preserving price feeds.</p>
        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Enter your Party ID"
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            className="login-input"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-button">
            Login
          </button>
        </form>
         <div className="login-hint">
          <p>For local testing, try these party names:</p>
          <ul>
            <li>Operator</li>
            <li>Bloomberg</li>
            <li>Reuters</li>
            <li>Coinbase</li>
            <li>HedgeFundA</li>
            <li>BankB</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

/**
 * The main application screen, shown after a user has logged in.
 * It provides the DamlLedger context and renders the main UI.
 */
const MainScreen: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const party = useParty();
  const [activeTab, setActiveTab] = useState<'subscriber' | 'provider'>('subscriber');

  return (
    <div className="main-container">
      <header className="main-header">
        <div className="header-left">
          <h2>Canton Oracle Network</h2>
        </div>
        <div className="header-right">
          <span className="party-info">Logged in as: <strong>{party}</strong></span>
          <button onClick={onLogout} className="logout-button">Logout</button>
        </div>
      </header>

      <nav className="main-nav">
        <button
          className={activeTab === 'subscriber' ? 'active' : ''}
          onClick={() => setActiveTab('subscriber')}
        >
          Subscriber Portal
        </button>
        <button
          className={activeTab === 'provider' ? 'active' : ''}
          onClick={() => setActiveTab('provider')}
        >
          Provider Portal
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'subscriber' && <FeedExplorer />}
        {activeTab === 'provider' && <ProviderPortal />}
      </main>

      <footer className="main-footer">
        <p>&copy; {new Date().getFullYear()} Canton Private Oracle. All rights reserved.</p>
      </footer>
    </div>
  );
};

/**
 * A placeholder component for the Provider Portal.
 * A real implementation would show provider obligations and forms to submit prices.
 */
const ProviderPortal: React.FC = () => {
  // In a real implementation, you would use useStreamQueries here to fetch
  // `Oracle.Provider.ProviderObligation` contracts and provide a UI to exercise
  // the `SubmitPrice` choice on them.

  return (
    <div className="portal-container">
      <h3>Your Price Feed Obligations</h3>
      <p>
        This section is for authorized data providers to submit price updates.
        You would see a list of feeds you are responsible for updating.
      </p>
      <div className="placeholder-content">
        <div className="obligation-card">
          <h4>ETH/USD Feed</h4>
          <p>Last Submitted: <strong>$3,015.50</strong> at 2024-05-21 10:00:00 UTC</p>
          <p>Next Update Due: In 5 minutes</p>
          <div className="price-submission-form">
            <input type="text" placeholder="Enter new price (e.g., 3020.10)" />
            <button>Submit Price</button>
          </div>
        </div>
        <div className="obligation-card">
          <h4>BTC/USD Feed</h4>
          <p>Last Submitted: <strong>$68,123.45</strong> at 2024-05-21 09:58:30 UTC</p>
          <p>Next Update Due: In 3 minutes</p>
           <div className="price-submission-form">
            <input type="text" placeholder="Enter new price (e.g., 68200.00)" />
            <button>Submit Price</button>
          </div>
        </div>
        <p className="coming-soon">(Feature under development)</p>
      </div>
    </div>
  );
};

/**
 * The root component of the application.
 * It manages the user's authentication state and provides the DamlLedger context
 * to the rest of the application.
 */
const App: React.FC = () => {
  const [credentials, setCredentials] = useState<Credentials | null>(() => {
    try {
      const savedCreds = localStorage.getItem('daml.credentials');
      return savedCreds ? JSON.parse(savedCreds) : null;
    } catch (e) {
      console.error("Failed to parse credentials from localStorage", e);
      return null;
    }
  });

  useEffect(() => {
    if (credentials) {
      localStorage.setItem('daml.credentials', JSON.stringify(credentials));
    } else {
      localStorage.removeItem('daml.credentials');
    }
  }, [credentials]);

  const handleLogin = (creds: Credentials) => {
    setCredentials(creds);
  };

  const handleLogout = () => {
    setCredentials(null);
  };

  const ledger = useMemo(() => {
    if (credentials) {
      return new DamlLedger({
        token: credentials.token,
        party: credentials.party,
        httpBaseUrl: HTTP_JSON_URL,
      });
    }
    return null;
  }, [credentials]);

  if (!ledger) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="App">
      <DamlLedger ledger={ledger}>
        <MainScreen onLogout={handleLogout} />
      </DamlLedger>
    </div>
  );
};

export default App;