// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EconomicSimulation_FHE is SepoliaConfig {
    struct EncryptedDecision {
        uint256 playerId;
        euint32 encryptedProduction;
        euint32 encryptedConsumption;
        euint32 encryptedTradeAmount;
        euint32 encryptedPrice;
        uint256 timestamp;
    }

    struct DecryptedDecision {
        uint32 production;
        uint32 consumption;
        uint32 tradeAmount;
        uint32 price;
        bool isRevealed;
    }

    struct MarketState {
        euint32 totalSupply;
        euint32 totalDemand;
        euint32 averagePrice;
    }

    uint256 public playerCount;
    mapping(uint256 => EncryptedDecision) public encryptedDecisions;
    mapping(uint256 => DecryptedDecision) public decryptedDecisions;
    MarketState public currentMarket;

    mapping(uint256 => uint256) private requestToDecisionId;
    
    event DecisionSubmitted(uint256 indexed playerId, uint256 timestamp);
    event MarketUpdated(uint256 timestamp);
    event DecisionDecrypted(uint256 indexed playerId);

    function joinGame() public returns (uint256) {
        playerCount += 1;
        return playerCount;
    }

    function submitEncryptedDecision(
        euint32 encryptedProduction,
        euint32 encryptedConsumption,
        euint32 encryptedTradeAmount,
        euint32 encryptedPrice
    ) public {
        uint256 playerId = getPlayerId(msg.sender);
        
        encryptedDecisions[playerId] = EncryptedDecision({
            playerId: playerId,
            encryptedProduction: encryptedProduction,
            encryptedConsumption: encryptedConsumption,
            encryptedTradeAmount: encryptedTradeAmount,
            encryptedPrice: encryptedPrice,
            timestamp: block.timestamp
        });

        decryptedDecisions[playerId] = DecryptedDecision({
            production: 0,
            consumption: 0,
            tradeAmount: 0,
            price: 0,
            isRevealed: false
        });

        updateMarketState(playerId);
        emit DecisionSubmitted(playerId, block.timestamp);
    }

    function updateMarketState(uint256 playerId) private {
        EncryptedDecision storage decision = encryptedDecisions[playerId];
        
        if (!FHE.isInitialized(currentMarket.totalSupply)) {
            currentMarket.totalSupply = FHE.asEuint32(0);
            currentMarket.totalDemand = FHE.asEuint32(0);
            currentMarket.averagePrice = FHE.asEuint32(0);
        }

        currentMarket.totalSupply = FHE.add(currentMarket.totalSupply, decision.encryptedProduction);
        currentMarket.totalDemand = FHE.add(currentMarket.totalDemand, decision.encryptedConsumption);
        
        emit MarketUpdated(block.timestamp);
    }

    function requestDecisionDecryption(uint256 playerId) public {
        require(msg.sender == getPlayerAddress(playerId), "Not player");
        require(!decryptedDecisions[playerId].isRevealed, "Already decrypted");

        EncryptedDecision storage decision = encryptedDecisions[playerId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(decision.encryptedProduction);
        ciphertexts[1] = FHE.toBytes32(decision.encryptedConsumption);
        ciphertexts[2] = FHE.toBytes32(decision.encryptedTradeAmount);
        ciphertexts[3] = FHE.toBytes32(decision.encryptedPrice);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDecision.selector);
        requestToDecisionId[reqId] = playerId;
    }

    function decryptDecision(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 playerId = requestToDecisionId[requestId];
        require(playerId != 0, "Invalid request");

        DecryptedDecision storage dDecision = decryptedDecisions[playerId];
        require(!dDecision.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        (uint32 production, uint32 consumption, uint32 tradeAmount, uint32 price) = 
            abi.decode(cleartexts, (uint32, uint32, uint32, uint32));
        
        dDecision.production = production;
        dDecision.consumption = consumption;
        dDecision.tradeAmount = tradeAmount;
        dDecision.price = price;
        dDecision.isRevealed = true;

        emit DecisionDecrypted(playerId);
    }

    function getPlayerDecision(uint256 playerId) public view returns (
        uint32 production,
        uint32 consumption,
        uint32 tradeAmount,
        uint32 price,
        bool isRevealed
    ) {
        DecryptedDecision storage d = decryptedDecisions[playerId];
        return (d.production, d.consumption, d.tradeAmount, d.price, d.isRevealed);
    }

    function requestMarketStateDecryption() public {
        require(FHE.isInitialized(currentMarket.totalSupply), "Market not initialized");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(currentMarket.totalSupply);
        ciphertexts[1] = FHE.toBytes32(currentMarket.totalDemand);
        ciphertexts[2] = FHE.toBytes32(currentMarket.averagePrice);
        
        FHE.requestDecryption(ciphertexts, this.decryptMarketState.selector);
    }

    function decryptMarketState(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
        (uint32 supply, uint32 demand, uint32 avgPrice) = abi.decode(cleartexts, (uint32, uint32, uint32));
        // Process decrypted market state as needed
    }

    // Helper functions
    mapping(address => uint256) private addressToPlayerId;
    mapping(uint256 => address) private playerIdToAddress;

    function getPlayerId(address playerAddress) private returns (uint256) {
        if (addressToPlayerId[playerAddress] == 0) {
            uint256 newId = joinGame();
            addressToPlayerId[playerAddress] = newId;
            playerIdToAddress[newId] = playerAddress;
            return newId;
        }
        return addressToPlayerId[playerAddress];
    }

    function getPlayerAddress(uint256 playerId) private view returns (address) {
        return playerIdToAddress[playerId];
    }
}