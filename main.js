let gameState = {
  cash: 1000,
  sessionStartTime: Date.now(),
  timeTicks: 0,
  servers: [],
  maxServers: 8,
  power: {
      capacity: 1000, // Watts
      usage: 0,
      upgradeCost: 750,
      upgradeAmount: 500,
      baseCostPerWatt: 0.001 // cost per watt per minute
  },
  cooling: {
      capacity: 50, // Heat units dissipated
      output: 0, // Heat units generated
      baseTemp: 15, // °C
      upgradeCost: 200,
      upgradeAmount: 20,
      costPerUnit: 0.1 // cost per cooling capacity unit per minute
  },
  contracts: {
      available: [],
      active: [],
      nextId: 1,
      maxAvailable: 5,
      generationInterval: 15, // seconds
      lastGenerationTick: 0,
  },
  shop: {
      serverCost: 500,
      serverSpecs: { compute: 50, power: 150, heat: 20, name: "Basic Server Mk1" },
      expandBuildingCost: 5000,
      expandBuildingAmount: 8,
  },
  eventLog: [],
  maxLogEntries: 50,
  nextServerId: 1,
  stats: {
      incomePerMinute: 0,
      expensesPerMinute: 0,
      clientSatisfaction: 100, // Average satisfaction
      totalComputeAvailable: 0,
      totalComputeUsed: 0,
  },
  randomEvents: {
      chancePerTick: 0.005, // 0.5% chance per second to trigger A random event
      activeEvents: [],
      // Cooldowns for specific event types to prevent them from re-triggering too frequently
      cooldowns: {}, // e.g., { POWER_FLUCTUATION: 60 (ticks remaining) }
      minCooldownBetweenAnyEvent: 10, // Minimum ticks before ANY new event can trigger
      lastEventTriggerTick: -Infinity
  }
};

const DOM = { // Cache DOM elements
  cash: document.getElementById('cash'),
  incomeMin: document.getElementById('income-min'),
  expensesMin: document.getElementById('expenses-min'),
  serversCount: document.getElementById('servers-count'),
  maxServers: document.getElementById('max-servers'),
  overviewServersCount: document.getElementById('overview-servers-count'),
  overviewMaxServers: document.getElementById('overview-max-servers'),
  powerUsage: document.getElementById('power-usage'),
  powerCapacity: document.getElementById('power-capacity'),
  heatOutput: document.getElementById('heat-output'),
  coolingCapacity: document.getElementById('cooling-capacity'),
  avgTemp: document.getElementById('avg-temp'),
  activeContractsCount: document.getElementById('active-contracts-count'),
  clientSatisfaction: document.getElementById('client-satisfaction'),
  totalCompute: document.getElementById('total-compute'),
  serverRack: document.getElementById('server-rack'),
  systemEventLog: document.getElementById('system-event-log'),
  sessionTimer: document.getElementById('session-timer'),
  tabs: document.querySelectorAll('.tab-button'),
  tabPanes: document.querySelectorAll('.tab-pane'),

  buyServerQuick: document.getElementById('buy-server-quick'),
  buyServerShop: document.getElementById('buy-server-shop'),
  buyServerCost: document.getElementById('buy-server-cost'),
  buyServerCostShop: document.getElementById('buy-server-cost-shop'),

  upgradePowerQuick: document.getElementById('upgrade-power-quick'),
  upgradePowerShop: document.getElementById('upgrade-power-shop'),
  upgradePowerCost: document.getElementById('upgrade-power-cost'),
  upgradePowerCostShop: document.getElementById('upgrade-power-cost-shop'),
  powerUpgradeAmount: document.getElementById('power-upgrade-amount'),

  upgradeCoolingQuick: document.getElementById('upgrade-cooling-quick'),
  upgradeCoolingShop: document.getElementById('upgrade-cooling-shop'),
  upgradeCoolingCost: document.getElementById('upgrade-cooling-cost'),
  upgradeCoolingCostShop: document.getElementById('upgrade-cooling-cost-shop'),
  coolingUpgradeAmount: document.getElementById('cooling-upgrade-amount'),

  expandBuildingOverview: document.getElementById('expand-building-overview'),
  expandBuildingShop: document.getElementById('expand-building-shop'),
  expandBuildingCost: document.getElementById('expand-building-cost'),
  expandBuildingCostShop: document.getElementById('expand-building-cost-shop'),
  rackExpansionAmount: document.getElementById('rack-expansion-amount'),

  availableContractsList: document.getElementById('available-contracts-list'),
  activeContractsListOverview: document.getElementById('active-contracts-list-overview'),
  activeContractsListDetailed: document.getElementById('active-contracts-list-detailed'),
  serverSoftwareList: document.getElementById('server-software-list'),
};

function init() {
  addLog("SYSTEM", "BitOps Data Center Tycoon Initialized.");
  addServer(true); // Start with one server
  updateShopCosts();
  setupEventListeners();
  renderServerRack();
  renderAvailableContracts();
  gameLoop();
}

function setupEventListeners() {
  DOM.tabs.forEach(tab => {
      // All tabs are now potentially clickable
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  [DOM.buyServerQuick, DOM.buyServerShop].forEach(btn => btn.addEventListener('click', () => buyServer()));
  [DOM.upgradePowerQuick, DOM.upgradePowerShop].forEach(btn => btn.addEventListener('click', () => upgradePower()));
  [DOM.upgradeCoolingQuick, DOM.upgradeCoolingShop].forEach(btn => btn.addEventListener('click', () => upgradeCooling()));
  [DOM.expandBuildingOverview, DOM.expandBuildingShop].forEach(btn => btn.addEventListener('click', () => expandBuilding()));
}

function switchTab(targetTabId) {
  DOM.tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === targetTabId));
  DOM.tabPanes.forEach(pane => pane.classList.toggle('active', pane.id === `${targetTabId}-tab`));
  if (targetTabId === 'software') {
      renderSoftwareTab();
  }
}

function addLog(type, message) {
  const timestamp = new Date().toLocaleTimeString();
  gameState.eventLog.unshift({ timestamp, type, message });
  if (gameState.eventLog.length > gameState.maxLogEntries) {
      gameState.eventLog.pop();
  }
  renderEventLog();
}

function renderEventLog() {
  DOM.systemEventLog.innerHTML = gameState.eventLog.map(entry => 
      `<div class="log-entry"><span class="timestamp">[${entry.timestamp}]</span> <span class="log-${entry.type}">${entry.type}:</span> ${entry.message}</div>`
  ).join('');
}

function addServer(isInitial = false) {
  if (gameState.servers.length >= gameState.maxServers) {
      addLog("WARNING", "Cannot add server: Rack is full. Expand building first.");
      return;
  }
  if (!isInitial && gameState.cash < gameState.shop.serverCost) {
      addLog("WARNING", `Not enough cash to buy a server. Need $${gameState.shop.serverCost}.`);
      return;
  }

  if (!isInitial) gameState.cash -= gameState.shop.serverCost;

  const newServer = {
      id: `SRV-${String(gameState.nextServerId++).padStart(3, '0')}`,
      name: gameState.shop.serverSpecs.name,
      status: 'OFFLINE', // Will be turned online if power permits
      computeProvided: gameState.shop.serverSpecs.compute,
      computeUsed: 0,
      powerConsumption: gameState.shop.serverSpecs.power,
      heatGeneration: gameState.shop.serverSpecs.heat,
      temp: gameState.cooling.baseTemp,
      assignedContractIds: [],
      software: { // Basic software state
          osId: 'basic',
          os: "BasicOS v1.0",
          antivirusId: 'none',
          antivirus: null,
          specialized: null,
      },
      isUnderMaintenance: false // Flag for maintenance state
  };
  gameState.servers.push(newServer);
  addLog("SYSTEM", `Server ${newServer.id} purchased and installed.`);
  renderServerRack();
  updateInfrastructureStats();
}

function buyServer() {
  addServer();
}

function upgradePower() {
  if (gameState.cash < gameState.power.upgradeCost) {
      addLog("WARNING", `Not enough cash to upgrade power. Need $${gameState.power.upgradeCost}.`);
      return;
  }
  gameState.cash -= gameState.power.upgradeCost;
  gameState.power.capacity += gameState.power.upgradeAmount;
  addLog("SYSTEM", `Power supply upgraded by ${gameState.power.upgradeAmount}W. New capacity: ${gameState.power.capacity}W.`);
  gameState.power.upgradeCost = Math.floor(gameState.power.upgradeCost * 1.5);
  updateShopCosts();
  updateInfrastructureStats();
}

function upgradeCooling() {
   if (gameState.cash < gameState.cooling.upgradeCost) {
      addLog("WARNING", `Not enough cash to upgrade cooling. Need $${gameState.cooling.upgradeCost}.`);
      return;
  }
  gameState.cash -= gameState.cooling.upgradeCost;
  gameState.cooling.capacity += gameState.cooling.upgradeAmount;
  addLog("SYSTEM", `Cooling system upgraded by ${gameState.cooling.upgradeAmount}H. New capacity: ${gameState.cooling.capacity}H.`);
  gameState.cooling.upgradeCost = Math.floor(gameState.cooling.upgradeCost * 1.6);
  updateShopCosts();
  updateInfrastructureStats();
}

function expandBuilding() {
  if (gameState.cash < gameState.shop.expandBuildingCost) {
      addLog("WARNING", `Not enough cash to expand building. Need $${gameState.shop.expandBuildingCost}.`);
      return;
  }
  gameState.cash -= gameState.shop.expandBuildingCost;
  gameState.maxServers += gameState.shop.expandBuildingAmount;
  addLog("SYSTEM", `Building expanded. Server rack capacity increased to ${gameState.maxServers}.`);
  gameState.shop.expandBuildingCost = Math.floor(gameState.shop.expandBuildingCost * 2);
  updateShopCosts();
  renderServerRack(); // Re-render to show new empty slots
  updateInfrastructureStats();
}


function renderServerRack() {
  DOM.serverRack.innerHTML = '';
  for (let i = 0; i < gameState.maxServers; i++) {
      const server = gameState.servers[i];
      const slotEl = document.createElement('div');
      slotEl.classList.add('server-slot');
      if (server) {
          slotEl.innerHTML = `
              <h5><span class="server-status-light status-${server.status}"></span>${server.id} (${server.name})</h5>
              <p>Status: ${server.status}</p>
              <p>Compute: ${server.computeUsed}/${server.computeProvided} CU</p>
              <p>Temp: ${server.temp.toFixed(1)}°C</p>
              <p>Power: ${server.powerConsumption}W</p>
          `;
      } else {
          slotEl.innerHTML = `<h5><span class="server-status-light status-EMPTY"></span>EMPTY SLOT</h5><p>Slot Available</p><p>-</p><p>0W</p>`;
      }
      DOM.serverRack.appendChild(slotEl);
  }
}

function updateShopCosts() {
  DOM.buyServerCost.textContent = DOM.buyServerCostShop.textContent = gameState.shop.serverCost;
  DOM.upgradePowerCost.textContent = DOM.upgradePowerCostShop.textContent = gameState.power.upgradeCost;
  DOM.powerUpgradeAmount.textContent = gameState.power.upgradeAmount;
  DOM.upgradeCoolingCost.textContent = DOM.upgradeCoolingCostShop.textContent = gameState.cooling.upgradeCost;
  DOM.coolingUpgradeAmount.textContent = gameState.cooling.upgradeAmount;
  DOM.expandBuildingCost.textContent = DOM.expandBuildingCostShop.textContent = gameState.shop.expandBuildingCost;
  DOM.rackExpansionAmount.textContent = gameState.shop.expandBuildingAmount;
}

function updateFinancialStats() {
  DOM.cash.textContent = Math.floor(gameState.cash);
  DOM.incomeMin.textContent = Math.floor(gameState.stats.incomePerMinute);
  DOM.expensesMin.textContent = Math.floor(gameState.stats.expensesPerMinute);
}

function updateInfrastructureStats() {
  DOM.serversCount.textContent = gameState.servers.length;
  DOM.maxServers.textContent = gameState.maxServers;
  DOM.overviewServersCount.textContent = gameState.servers.length;
  DOM.overviewMaxServers.textContent = gameState.maxServers;
  DOM.powerUsage.textContent = gameState.power.usage;
  DOM.powerCapacity.textContent = gameState.power.capacity;
  DOM.heatOutput.textContent = gameState.cooling.output;
  DOM.coolingCapacity.textContent = gameState.cooling.capacity;

  let totalTemp = 0;
  let onlineServers = 0;
  gameState.servers.forEach(s => {
      if(s.status === 'ONLINE' || s.status === 'THROTTLED') {
          totalTemp += s.temp;
          onlineServers++;
      }
  });
  DOM.avgTemp.textContent = onlineServers > 0 ? (totalTemp / onlineServers).toFixed(1) : gameState.cooling.baseTemp.toFixed(1);

  DOM.totalCompute.textContent = gameState.stats.totalComputeAvailable;

  // Update button states based on cash
  [DOM.buyServerQuick, DOM.buyServerShop].forEach(b => b.disabled = gameState.cash < gameState.shop.serverCost || gameState.servers.length >= gameState.maxServers);
  [DOM.upgradePowerQuick, DOM.upgradePowerShop].forEach(b => b.disabled = gameState.cash < gameState.power.upgradeCost);
  [DOM.upgradeCoolingQuick, DOM.upgradeCoolingShop].forEach(b => b.disabled = gameState.cash < gameState.cooling.upgradeCost);
  [DOM.expandBuildingOverview, DOM.expandBuildingShop].forEach(b => b.disabled = gameState.cash < gameState.shop.expandBuildingCost);
}

function updateClientServiceStats() {
  DOM.activeContractsCount.textContent = gameState.contracts.active.length;
  DOM.clientSatisfaction.textContent = gameState.stats.clientSatisfaction.toFixed(1);
}


function processRandomEvents(deltaTime) {
  const now = gameState.timeTicks;
  // Decrement cooldowns
  for (const eventType in gameState.randomEvents.cooldowns) {
      gameState.randomEvents.cooldowns[eventType] -= deltaTime;
      if (gameState.randomEvents.cooldowns[eventType] <= 0) {
          delete gameState.randomEvents.cooldowns[eventType];
      }
  }
  // Process active events
  gameState.randomEvents.activeEvents = gameState.randomEvents.activeEvents.filter(event => {
      event.remainingTicks -= deltaTime;
      if (event.remainingTicks <= 0) {
          // Event ended
          if (event.type === 'POWER_FLUCTUATION') {
              gameState.power.capacity = event.originalCapacity;
              addLog("SYSTEM", `Power grid stability restored. Capacity back to ${event.originalCapacity}W.`);
              gameState.randomEvents.cooldowns.POWER_FLUCTUATION = 120; // 2 minutes cooldown for this specific event
          }
          // Add other event resolutions here for events like 'MINOR_COMPONENT_GLITCH'
          if (event.type === 'MINOR_COMPONENT_GLITCH' && event.targetServerId) {
              const server = gameState.servers.find(s => s.id === event.targetServerId);
              if (server) {
                  server.status = event.originalStatus; // Restore original status
                  server.isUnderMaintenance = false;
                  addLog("SYSTEM", `Maintenance complete on ${server.id}. Server restored to ${server.status} status.`);
              }
               gameState.randomEvents.cooldowns.MINOR_COMPONENT_GLITCH = 180; // 3 minutes cooldown
          }
          return false; // Remove from active events
      }
      return true; // Keep in active events
  });
  // Try to trigger a new event
  if (now < gameState.randomEvents.lastEventTriggerTick + gameState.randomEvents.minCooldownBetweenAnyEvent) {
      return; // Global cooldown for any new event
  }
  if (Math.random() < gameState.randomEvents.chancePerTick) {
      const availableEventTypes = ['POWER_FLUCTUATION', 'MINOR_COMPONENT_GLITCH'];
      const eventTypeToTrigger = availableEventTypes[Math.floor(Math.random() * availableEventTypes.length)];
      if (eventTypeToTrigger === 'POWER_FLUCTUATION') {
          if (!gameState.randomEvents.activeEvents.some(e => e.type === 'POWER_FLUCTUATION') && !gameState.randomEvents.cooldowns.POWER_FLUCTUATION) {
              triggerPowerFluctuationEvent();
              gameState.randomEvents.lastEventTriggerTick = now;
          }
      } else if (eventTypeToTrigger === 'MINOR_COMPONENT_GLITCH') {
          if (!gameState.randomEvents.activeEvents.some(e => e.type === 'MINOR_COMPONENT_GLITCH') && !gameState.randomEvents.cooldowns.MINOR_COMPONENT_GLITCH) {
              triggerMinorComponentGlitchEvent();
              gameState.randomEvents.lastEventTriggerTick = now;
          }
      }
  }
}
function triggerPowerFluctuationEvent() {
  const reductionPercentage = 0.15; // 15% reduction
  const originalCapacity = gameState.power.capacity;
  const reductionAmount = Math.floor(originalCapacity * reductionPercentage);
  const newCapacity = originalCapacity - reductionAmount;
  const durationTicks = 30; // 30 seconds
  gameState.power.capacity = newCapacity;

  const event = {
      type: 'POWER_FLUCTUATION',
      durationTicks: durationTicks,
      remainingTicks: durationTicks,
      originalCapacity: originalCapacity,
      reductionAmount: reductionAmount,
      message: `Minor power fluctuation detected! System capacity temporarily reduced by ${reductionAmount}W to ${newCapacity}W.`
  };
  gameState.randomEvents.activeEvents.push(event);
  addLog("WARNING", event.message);
  gameState.randomEvents.activeEvents.push(event);
  addLog("WARNING", event.message);
}
function triggerMinorComponentGlitchEvent() {
  const onlineServers = gameState.servers.filter(s => s.status === 'ONLINE' || s.status === 'THROTTLED');
  if (onlineServers.length === 0) return; // No server to affect
  const serverToAffect = onlineServers[Math.floor(Math.random() * onlineServers.length)];
  const originalStatus = serverToAffect.status;
  const durationTicks = 45; // 45 seconds
  serverToAffect.status = 'MAINTENANCE';
  serverToAffect.isUnderMaintenance = true; // Mark for specific handling if needed
  const event = {
      type: 'MINOR_COMPONENT_GLITCH',
      targetServerId: serverToAffect.id,
      durationTicks: durationTicks,
      remainingTicks: durationTicks,
      originalStatus: originalStatus,
      message: `Server ${serverToAffect.id} experienced a minor component glitch! It's now under MAINTENANCE for ${durationTicks}s.`
  };
  gameState.randomEvents.activeEvents.push(event);
  addLog("WARNING", event.message);
}
function processServersAndInfrastructure(deltaTime) {
  let currentPowerUsage = 0;
  let currentHeatOutput = 0;
  let totalAvailableCompute = 0;

  gameState.servers.forEach(server => {
      // Skip processing for servers under maintenance by events
      if (server.isUnderMaintenance || server.status === 'MAINTENANCE') {
          totalAvailableCompute += 0; // No compute from maintenance servers
          server.temp = Math.max(gameState.cooling.baseTemp, server.temp - 1 * deltaTime); // Cools down slowly during maintenance
           // Power consumption might be lower during maintenance, simplified for now
          const effectiveStats = getServerEffectiveStats(server);
          currentPowerUsage += effectiveStats.power * 0.2; // Assume maintenance mode uses less power
          server.computeUsed = 0;
          return; // Skip to next server
      }
      
      // Get effective stats including software bonuses/penalties
      const effectiveStats = getServerEffectiveStats(server);
      
      // Power Check
      if (currentPowerUsage + effectiveStats.power <= gameState.power.capacity) {
          if (server.status === 'OFFLINE') {
               addLog("SYSTEM", `Server ${server.id} is now ONLINE.`);
               server.status = 'ONLINE';
          }
          currentPowerUsage += effectiveStats.power;

          // Heat Check
          const heatDelta = effectiveStats.heat - (gameState.cooling.capacity / Math.max(1, gameState.servers.filter(s=> s.status !== 'OFFLINE' && !s.isUnderMaintenance).length) );
          server.temp += heatDelta * 0.05 * deltaTime; 
          server.temp = Math.max(gameState.cooling.baseTemp, server.temp);
          if (server.temp > 85) {
              if (server.status !== 'OVERHEATED') addLog("ERROR", `Server ${server.id} is CRITICALLY OVERHEATED! Risk of failure.`);
              server.status = 'OVERHEATED';
              totalAvailableCompute += 0; // No compute if overheated
          } else if (server.temp > 60) {
               if (server.status !== 'THROTTLED' && server.status !== 'OVERHEATED') addLog("WARNING", `Server ${server.id} is running hot and is now THROTTLED.`);
              server.status = 'THROTTLED';
               totalAvailableCompute += effectiveStats.compute * 0.5; 
          } else {
              // If it was throttled or overheated and temp is now fine, and not offline from other reasons
              if (server.status === 'THROTTLED' || server.status === 'OVERHEATED') {
                   addLog("SYSTEM", `Server ${server.id} temperature stabilized. Now ONLINE.`);
              }
              server.status = 'ONLINE';
              totalAvailableCompute += effectiveStats.compute;
          }
          currentHeatOutput += effectiveStats.heat;
      } else {
          if (server.status !== 'OFFLINE') addLog("WARNING", `Server ${server.id} taken OFFLINE due to insufficient power.`);
          server.status = 'OFFLINE';
          server.temp = Math.max(gameState.cooling.baseTemp, server.temp - 2 * deltaTime);
      }
      server.computeUsed = 0; // Reset for this tick's allocation
  });

  gameState.power.usage = currentPowerUsage;
  gameState.cooling.output = currentHeatOutput;
  gameState.stats.totalComputeAvailable = totalAvailableCompute;
}


function generateContract() {
  const types = [
      { name: "Web Hosting Startup", baseCompute: 20, computeVariance: 20, basePayout: 50, duration: 180 }, // 3 min
      { name: "Data Analytics Batch", baseCompute: 50, computeVariance: 30, basePayout: 150, duration: 300 }, // 5 min
      { name: "Game Server Instance", baseCompute: 80, computeVariance: 40, basePayout: 250, duration: 240 }, // 4 min
  ];
  const type = types[Math.floor(Math.random() * types.length)];

  const contract = {
      id: `CTR-${String(gameState.contracts.nextId++).padStart(3, '0')}`,
      clientName: type.name,
      computeDemand: type.baseCompute + Math.floor(Math.random() * type.computeVariance),
      payoutPerMinute: type.basePayout + Math.floor(Math.random() * type.basePayout * 0.2),
      durationSeconds: type.duration, // seconds
      timeRemainingSeconds: type.duration,
      satisfaction: 100, // Starts at 100%
  };
  gameState.contracts.available.push(contract);
  addLog("CONTRACT", `New contract available: ${contract.clientName} (${contract.computeDemand} CU).`);
  renderAvailableContracts();
}

function renderAvailableContracts() {
  if (DOM.availableContractsList) {
      if (gameState.contracts.available.length === 0) {
          DOM.availableContractsList.innerHTML = "<p>No new contracts available at the moment.</p>";
      } else {
          DOM.availableContractsList.innerHTML = gameState.contracts.available.map(c => `
              <div class="contract-item">
                  <h5>${c.clientName} (ID: ${c.id})</h5>
                  <p>Demand: ${c.computeDemand} CU/s</p>
                  <p>Payout: $${c.payoutPerMinute}/min (at 100% satisfaction)</p>
                  <p>Duration: ${(c.durationSeconds / 60).toFixed(1)} min</p>
                  <button class="action-button success accept-contract-btn" data-id="${c.id}">ACCEPT</button>
              </div>
          `).join('');
          document.querySelectorAll('.accept-contract-btn').forEach(btn => {
              btn.addEventListener('click', (e) => acceptContract(e.target.dataset.id));
          });
      }
  }
}

function acceptContract(contractId) {
  const contractIndex = gameState.contracts.available.findIndex(c => c.id === contractId);
  if (contractIndex === -1) return;

  const [contract] = gameState.contracts.available.splice(contractIndex, 1);
  gameState.contracts.active.push(contract);
  addLog("CONTRACT", `Contract ${contract.id} (${contract.clientName}) accepted.`);
  renderAvailableContracts();
  renderActiveContracts();
}

function processContracts(deltaTime) {
  let totalComputeDemand = 0;
  gameState.contracts.active.forEach(c => totalComputeDemand += c.computeDemand);

  let currentDistributedCompute = 0;
  let totalPayoutThisTick = 0;
  let overallSatisfactionSum = 0;
  let activeContractCountForSatisfaction = 0;

  gameState.contracts.active.forEach(contract => {
      let computeAllocatedThisTick = 0;
      if (gameState.stats.totalComputeAvailable > currentDistributedCompute) {
          const canAllocate = Math.min(contract.computeDemand, gameState.stats.totalComputeAvailable - currentDistributedCompute);
          computeAllocatedThisTick = canAllocate;
          currentDistributedCompute += canAllocate;

          // Assign compute to servers (simplified: just mark as used)
          let remainingToAllocateToServer = canAllocate;
          for (const server of gameState.servers) {
              if ((server.status === 'ONLINE' || server.status === 'THROTTLED') && !server.isUnderMaintenance) {
                  const effectiveStats = getServerEffectiveStats(server);
                  let effectiveCompute = effectiveStats.compute;
                  if (server.status === 'THROTTLED') effectiveCompute *= 0.5;

                  const serverCanTake = effectiveCompute - server.computeUsed;
                  if (serverCanTake > 0) {
                      const took = Math.min(remainingToAllocateToServer, serverCanTake);
                      server.computeUsed += took;
                      remainingToAllocateToServer -= took;
                      if (remainingToAllocateToServer <= 0) break;
                  }
              }
          }
      }

      const satisfactionRatio = contract.computeDemand > 0 ? (computeAllocatedThisTick / contract.computeDemand) : 1;
      contract.satisfaction = satisfactionRatio * 100; // Instant satisfaction based on current tick

      // Payout is per minute, so scale it per tick
      totalPayoutThisTick += (contract.payoutPerMinute / 60) * satisfactionRatio * deltaTime;

      contract.timeRemainingSeconds -= deltaTime;
      if (contract.timeRemainingSeconds <= 0) {
          addLog("CONTRACT", `Contract ${contract.id} (${contract.clientName}) completed. Final Satisfaction: ${contract.satisfaction.toFixed(1)}%`);
      }

      overallSatisfactionSum += contract.satisfaction;
      activeContractCountForSatisfaction++;
  });

  gameState.stats.totalComputeUsed = currentDistributedCompute;
  gameState.cash += totalPayoutThisTick;
  gameState.stats.incomePerMinute = totalPayoutThisTick * (60 / deltaTime); // Extrapolate to per minute

  if (activeContractCountForSatisfaction > 0) {
      gameState.stats.clientSatisfaction = overallSatisfactionSum / activeContractCountForSatisfaction;
  } else {
      gameState.stats.clientSatisfaction = 100; // Default if no active contracts
  }

  // Remove completed contracts
  gameState.contracts.active = gameState.contracts.active.filter(c => c.timeRemainingSeconds > 0);
}

function renderActiveContracts() {
  const overviewList = gameState.contracts.active.map(c => `
      <div class="active-contract-item">
          <h5>${c.clientName} (ID: ${c.id}) - ${c.satisfaction.toFixed(0)}%</h5>
          <p>Time Left: ${(c.timeRemainingSeconds / 60).toFixed(1)} min</p>
          <div class="progress-bar-container"><div class="progress-bar" style="width:${((c.durationSeconds - c.timeRemainingSeconds) / c.durationSeconds * 100).toFixed(1)}%;"></div></div>
      </div>`).join('');

  DOM.activeContractsListOverview.innerHTML = gameState.contracts.active.length > 0 ? overviewList : "<p>No active contracts. Visit the CONTRACTS tab to accept new work.</p>";
  DOM.activeContractsListDetailed.innerHTML = gameState.contracts.active.length > 0 ? overviewList : "<p>No active contracts.</p>"; // Same for detailed view for now
}
// Software catalog with costs and effects
const SOFTWARE_CATALOG = {
  os: [
    { id: 'basic', name: 'BasicOS v1.0', cost: 0, computeBonus: 0, powerPenalty: 0, description: 'Free basic OS' },
    { id: 'advanced', name: 'AdvancedOS v2.1', cost: 200, computeBonus: 10, powerPenalty: 5, description: '+10 CU, +5W power' },
    { id: 'enterprise', name: 'EnterpriseOS v3.0', cost: 500, computeBonus: 25, powerPenalty: 15, description: '+25 CU, +15W power' },
    { id: 'optimized', name: 'OptimizedOS v1.5', cost: 350, computeBonus: 15, powerPenalty: -10, description: '+15 CU, -10W power' }
  ],
  antivirus: [
    { id: 'none', name: 'None', cost: 0, computePenalty: 0, powerPenalty: 0, description: 'No protection' },
    { id: 'basic', name: 'BasicShield AV', cost: 100, computePenalty: 5, powerPenalty: 3, description: 'Basic protection, -5 CU, +3W' },
    { id: 'premium', name: 'PremiumGuard AV', cost: 250, computePenalty: 8, powerPenalty: 5, description: 'Strong protection, -8 CU, +5W' },
    { id: 'enterprise', name: 'EnterpriseDefender AV', cost: 400, computePenalty: 3, powerPenalty: 8, description: 'Optimized protection, -3 CU, +8W' }
  ]
};

function getServerEffectiveStats(server) {
  const osData = SOFTWARE_CATALOG.os.find(os => os.id === server.software.osId) || SOFTWARE_CATALOG.os[0];
  const avData = SOFTWARE_CATALOG.antivirus.find(av => av.id === server.software.antivirusId) || SOFTWARE_CATALOG.antivirus[0];
  
  return {
    compute: server.computeProvided + osData.computeBonus - avData.computePenalty,
    power: server.powerConsumption + osData.powerPenalty + avData.powerPenalty,
    heat: server.heatGeneration
  };
}

function showSoftwareMenu(serverId, softwareType) {
  const server = gameState.servers.find(s => s.id === serverId);
  if (!server || server.isUnderMaintenance) return;

  const catalog = SOFTWARE_CATALOG[softwareType];
  const currentId = softwareType === 'os' ? server.software.osId : server.software.antivirusId;
  
  const menuHtml = `
    <div id="software-menu" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg-dark-primary); border: 2px solid var(--border-color); padding: 20px; border-radius: 8px; z-index: 1000; max-width: 400px;">
      <h4>Install ${softwareType.toUpperCase()} for ${serverId}</h4>
      <p>Current: ${softwareType === 'os' ? server.software.os : (server.software.antivirus || 'None')}</p>
      ${catalog.map(item => `
        <div style="margin: 10px 0; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; ${item.id === currentId ? 'background: var(--bg-dark-secondary);' : ''}">
          <strong>${item.name}</strong> - $${item.cost}
          <br><small>${item.description}</small>
          <br><button class="action-button ${item.id === currentId ? '' : 'success'}" 
                     data-install="${item.id}" 
                     data-cost="${item.cost}"
                     ${item.id === currentId ? 'disabled' : ''}
                     ${gameState.cash < item.cost ? 'disabled' : ''}>
            ${item.id === currentId ? 'INSTALLED' : 'INSTALL'}
          </button>
        </div>
      `).join('')}
      <br><button class="action-button" id="close-software-menu">CLOSE</button>
    </div>
    <div id="software-menu-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 999;"></div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', menuHtml);
  
  document.getElementById('close-software-menu').addEventListener('click', closeSoftwareMenu);
  document.getElementById('software-menu-overlay').addEventListener('click', closeSoftwareMenu);
  
  document.querySelectorAll('[data-install]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const itemId = e.target.dataset.install;
      const cost = parseInt(e.target.dataset.cost);
      installSoftware(serverId, softwareType, itemId, cost);
      closeSoftwareMenu();
    });
  });
}

function closeSoftwareMenu() {
  const menu = document.getElementById('software-menu');
  const overlay = document.getElementById('software-menu-overlay');
  if (menu) menu.remove();
  if (overlay) overlay.remove();
}

function installSoftware(serverId, softwareType, itemId, cost) {
  const server = gameState.servers.find(s => s.id === serverId);
  if (!server || gameState.cash < cost) return;

  gameState.cash -= cost;
  
  if (softwareType === 'os') {
    const osData = SOFTWARE_CATALOG.os.find(os => os.id === itemId);
    server.software.osId = itemId;
    server.software.os = osData.name;
    addLog("MAINTENANCE", `${osData.name} installed on ${serverId} for $${cost}.`);
  } else if (softwareType === 'antivirus') {
    const avData = SOFTWARE_CATALOG.antivirus.find(av => av.id === itemId);
    server.software.antivirusId = itemId;
    server.software.antivirus = itemId === 'none' ? null : avData.name;
    addLog("MAINTENANCE", `${avData.name} installed on ${serverId} for $${cost}.`);
  }
  
  // Recalculate server stats
  const newStats = getServerEffectiveStats(server);
  server.computeProvided = Math.max(10, newStats.compute); // Minimum 10 CU
  server.powerConsumption = Math.max(50, newStats.power); // Minimum 50W
  
  renderSoftwareTab();
  updateInfrastructureStats();
}

function renderSoftwareTab() {
  if (!DOM.serverSoftwareList) return;
  if (gameState.servers.length === 0) {
      DOM.serverSoftwareList.innerHTML = "<p>No servers installed. Visit the SHOP to purchase servers.</p>";
      return;
  }
  DOM.serverSoftwareList.innerHTML = gameState.servers.map(server => {
    const effectiveStats = getServerEffectiveStats(server);
    return `
      <div class="software-server-card">
          <h5><span class="server-status-light status-${server.status}"></span>${server.id} (${server.name})</h5>
          <p>Status: ${server.status}</p>
          <p>Effective Compute: ${effectiveStats.compute} CU (${server.computeUsed}/${effectiveStats.compute} used)</p>
          <p>Power Draw: ${effectiveStats.power}W</p>
          <p>OS: ${server.software.os}</p>
          <p>Anti-Virus: ${server.software.antivirus || 'None'}</p>
          <div class="software-options">
              <button class="action-button info install-os-btn" data-server-id="${server.id}" ${server.isUnderMaintenance ? 'disabled' : ''}>Change OS</button>
              <button class="action-button warning install-av-btn" data-server-id="${server.id}" ${server.isUnderMaintenance ? 'disabled' : ''}>Change AV</button>
          </div>
      </div>
  `;
  }).join('');
  
  // Add event listeners for software action buttons
  DOM.serverSoftwareList.querySelectorAll('.install-os-btn').forEach(button => {
      button.addEventListener('click', (e) => {
          const serverId = e.target.dataset.serverId;
          showSoftwareMenu(serverId, 'os');
      });
  });
  
  DOM.serverSoftwareList.querySelectorAll('.install-av-btn').forEach(button => {
      button.addEventListener('click', (e) => {
          const serverId = e.target.dataset.serverId;
          showSoftwareMenu(serverId, 'antivirus');
      });
  });
}
function calculateExpenses(deltaTime) {
  // Simplified: base cost for power capacity and cooling capacity
  const powerExpense = gameState.power.capacity * gameState.power.baseCostPerWatt * (deltaTime / 60);
  const coolingExpense = gameState.cooling.capacity * gameState.cooling.costPerUnit * (deltaTime / 60);
  const totalExpensesThisTick = powerExpense + coolingExpense;
  gameState.cash -= totalExpensesThisTick;
  gameState.stats.expensesPerMinute = totalExpensesThisTick * (60 / deltaTime);
}

function updateSessionTimer() {
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - gameState.sessionStartTime) / 1000);
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  DOM.sessionTimer.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function gameLoop() {
  const deltaTime = 1; // Simulate 1 second per tick
  gameState.timeTicks += deltaTime;

  // Contract Generation
  if (gameState.contracts.available.length < gameState.contracts.maxAvailable &&
      (gameState.timeTicks - gameState.contracts.lastGenerationTick >= gameState.contracts.generationInterval)) {
      generateContract();
      gameState.contracts.lastGenerationTick = gameState.timeTicks;
  }

  processRandomEvents(deltaTime); // Process events before infrastructure updates
  processServersAndInfrastructure(deltaTime);
  processContracts(deltaTime);
  calculateExpenses(deltaTime);
  // Update UI
  updateFinancialStats();
  updateInfrastructureStats();
  updateClientServiceStats();
  renderServerRack(); // In case status/temp/maintenance changed
  renderActiveContracts(); // Update progress bars etc.
  updateSessionTimer();
  if (document.getElementById('software-tab').classList.contains('active')) {
      renderSoftwareTab(); // Keep software tab updated if active
  }

  setTimeout(gameLoop, 1000); // Loop every second
}

// Start the game
init();
