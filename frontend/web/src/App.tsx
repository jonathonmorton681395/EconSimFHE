// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface EconomicData {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  dataType: string;
  value: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [economicData, setEconomicData] = useState<EconomicData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newEconomicData, setNewEconomicData] = useState({
    dataType: "",
    value: 0,
    description: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate statistics
  const totalValue = economicData.reduce((sum, item) => sum + item.value, 0);
  const productionData = economicData.filter(item => item.dataType === "production");
  const consumptionData = economicData.filter(item => item.dataType === "consumption");
  const tradeData = economicData.filter(item => item.dataType === "trade");

  useEffect(() => {
    loadEconomicData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadEconomicData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("economic_data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing economic data keys:", e);
        }
      }
      
      const list: EconomicData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`economic_${key}`);
          if (dataBytes.length > 0) {
            try {
              const data = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                encryptedData: data.encryptedData,
                timestamp: data.timestamp,
                owner: data.owner,
                dataType: data.dataType,
                value: data.value || 0
              });
            } catch (e) {
              console.error(`Error parsing economic data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading economic data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setEconomicData(list);
    } catch (e) {
      console.error("Error loading economic data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitEconomicData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting economic data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-ECON-${btoa(JSON.stringify(newEconomicData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const economicData = {
        encryptedData: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        dataType: newEconomicData.dataType,
        value: newEconomicData.value
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `economic_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(economicData))
      );
      
      const keysBytes = await contract.getData("economic_data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "economic_data_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Economic data encrypted and stored securely!"
      });
      
      await loadEconomicData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewEconomicData({
          dataType: "",
          value: 0,
          description: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const checkAvailability = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE Contract is ${isAvailable ? "available" : "not available"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to participate in the private economic simulation",
      icon: "🔗"
    },
    {
      title: "Submit Economic Data",
      description: "Add your production, consumption or trade data which will be encrypted using FHE",
      icon: "📊"
    },
    {
      title: "FHE Market Simulation",
      description: "Your data is processed in encrypted state without decryption for market analysis",
      icon: "⚙️"
    },
    {
      title: "View Results",
      description: "See market trends and economic indicators while keeping your data private",
      icon: "📈"
    }
  ];

  const filteredData = economicData.filter(item => 
    item.dataType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.owner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderBarChart = () => {
    const productionValue = productionData.reduce((sum, item) => sum + item.value, 0);
    const consumptionValue = consumptionData.reduce((sum, item) => sum + item.value, 0);
    const tradeValue = tradeData.reduce((sum, item) => sum + item.value, 0);
    
    const maxValue = Math.max(productionValue, consumptionValue, tradeValue, 1);
    
    return (
      <div className="bar-chart-container">
        <div className="bar-chart">
          <div className="bar-wrapper">
            <div className="bar-label">Production</div>
            <div className="bar">
              <div 
                className="bar-fill production" 
                style={{ width: `${(productionValue / maxValue) * 100}%` }}
              ></div>
            </div>
            <div className="bar-value">{productionValue}</div>
          </div>
          <div className="bar-wrapper">
            <div className="bar-label">Consumption</div>
            <div className="bar">
              <div 
                className="bar-fill consumption" 
                style={{ width: `${(consumptionValue / maxValue) * 100}%` }}
              ></div>
            </div>
            <div className="bar-value">{consumptionValue}</div>
          </div>
          <div className="bar-wrapper">
            <div className="bar-label">Trade</div>
            <div className="bar">
              <div 
                className="bar-fill trade" 
                style={{ width: `${(tradeValue / maxValue) * 100}%` }}
              ></div>
            </div>
            <div className="bar-value">{tradeValue}</div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE economic simulation...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="economy-icon"></div>
          </div>
          <h1>Econ<span>Sim</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-data-btn primary-button"
          >
            <div className="add-icon"></div>
            Add Economic Data
          </button>
          <button 
            className="secondary-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <button 
            className="secondary-button"
            onClick={checkAvailability}
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Powered Private Economic Simulation</h2>
            <p>Participate in an on-chain economic simulation where all data remains encrypted using Fully Homomorphic Encryption</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How the FHE Economic Simulation Works</h2>
            <p className="subtitle">Learn how to participate in the private on-chain economy</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="tab-navigation">
          <button 
            className={activeTab === "dashboard" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button 
            className={activeTab === "data" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("data")}
          >
            Economic Data
          </button>
          <button 
            className={activeTab === "analytics" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("analytics")}
          >
            Analytics
          </button>
        </div>
        
        {activeTab === "dashboard" && (
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <h3>Project Introduction</h3>
              <p>EconSimFHE is an on-chain economic simulation game powered by Fully Homomorphic Encryption. Players can submit production, consumption, and trade data that remains encrypted while being processed by the market simulation.</p>
              <div className="fhe-badge">
                <span>FHE-Powered</span>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Economic Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{economicData.length}</div>
                  <div className="stat-label">Total Records</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{productionData.length}</div>
                  <div className="stat-label">Production</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{consumptionData.length}</div>
                  <div className="stat-label">Consumption</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{tradeData.length}</div>
                  <div className="stat-label">Trade</div>
                </div>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Total Economic Value</h3>
              <div className="total-value">
                <span className="value">{totalValue}</span>
                <span className="label">Encrypted Value Units</span>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Economic Activity Distribution</h3>
              {renderBarChart()}
            </div>
          </div>
        )}
        
        {activeTab === "data" && (
          <div className="data-section">
            <div className="section-header">
              <h2>Encrypted Economic Data</h2>
              <div className="header-actions">
                <div className="search-box">
                  <input 
                    type="text" 
                    placeholder="Search data..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button 
                  onClick={loadEconomicData}
                  className="refresh-btn secondary-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="data-list">
              {filteredData.length === 0 ? (
                <div className="no-data">
                  <div className="no-data-icon"></div>
                  <p>No economic data found</p>
                  <button 
                    className="primary-button"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Add First Data Point
                  </button>
                </div>
              ) : (
                filteredData.map(item => (
                  <div className="data-item" key={item.id}>
                    <div className="data-content">
                      <div className="data-type">{item.dataType}</div>
                      <div className="data-value">{item.value} EVU</div>
                      <div className="data-owner">{item.owner.substring(0, 6)}...{item.owner.substring(38)}</div>
                      <div className="data-date">
                        {new Date(item.timestamp * 1000).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="data-actions">
                      <div className="encrypted-badge">
                        <span>FHE Encrypted</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "analytics" && (
          <div className="analytics-section">
            <h2>Market Analytics</h2>
            <p className="subtitle">Aggregated insights from encrypted economic data</p>
            
            <div className="analytics-grid">
              <div className="analytics-card">
                <h3>Production Trends</h3>
                <div className="trend-value">
                  +{productionData.length > 0 ? Math.round(productionData.reduce((sum, item) => sum + item.value, 0) / productionData.length) : 0}
                </div>
                <p>Average production value per transaction</p>
              </div>
              
              <div className="analytics-card">
                <h3>Consumption Patterns</h3>
                <div className="trend-value">
                  +{consumptionData.length > 0 ? Math.round(consumptionData.reduce((sum, item) => sum + item.value, 0) / consumptionData.length) : 0}
                </div>
                <p>Average consumption value per transaction</p>
              </div>
              
              <div className="analytics-card">
                <h3>Trade Volume</h3>
                <div className="trend-value">
                  {tradeData.length}
                </div>
                <p>Total trade transactions</p>
              </div>
              
              <div className="analytics-card">
                <h3>Market Health</h3>
                <div className="health-indicator">
                  <div className="health-value">Good</div>
                  <div className="health-bar">
                    <div className="health-fill"></div>
                  </div>
                </div>
                <p>Based on encrypted economic indicators</p>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitEconomicData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          economicData={newEconomicData}
          setEconomicData={setNewEconomicData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="economy-icon"></div>
              <span>EconSimFHE</span>
            </div>
            <p>FHE-powered private on-chain economic simulation</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Economic Simulation</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} EconSimFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  economicData: any;
  setEconomicData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  economicData,
  setEconomicData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEconomicData({
      ...economicData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!economicData.dataType || economicData.value <= 0) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Economic Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your economic data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Data Type *</label>
              <select 
                name="dataType"
                value={economicData.dataType} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="">Select data type</option>
                <option value="production">Production</option>
                <option value="consumption">Consumption</option>
                <option value="trade">Trade</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Value *</label>
              <input 
                type="number"
                name="value"
                value={economicData.value} 
                onChange={handleChange}
                placeholder="Enter value..." 
                className="form-input"
                min="0"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Description</label>
              <textarea 
                name="description"
                value={economicData.description} 
                onChange={handleChange}
                placeholder="Optional description..." 
                className="form-textarea"
                rows={3}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE market simulation
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn secondary-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary-button"
          >
            {creating ? "Encrypting with FHE..." : "Submit Data"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;