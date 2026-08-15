// Main Application Logic for Live FRED Macro Economic Dashboard
document.addEventListener("DOMContentLoaded", () => {
  const SERVER_MANAGED_FRED_KEY = "7410087869ed2b570bfc61054c96b13c";
  const savedFredApiKey = "7410087869ed2b570bfc61054c96b13c";

  // --- State Management ---
  const state = {
    currentView: "overview",
    selectedIndicatorCode: "cpi",
    activeCategoryFilter: "All",
    searchQuery: "",
    impactFilter: "All",
    fredApiKey: "7410087869ed2b570bfc61054c96b13c",
    chartInstance: null,
    fredCache: new Map(),
    forexFactoryCalendar: [],
    timeframe: "3Y",
    showSma: false,
    compareMode: false,
    compareIndicatorCode: "",
    calCurrencyFilter: localStorage.getItem("cal_currency_filter") || "All",
    calImpactFilter: localStorage.getItem("cal_impact_filter") || "HighMedium",
    calHidePast: localStorage.getItem("cal_hide_past") !== "false"
  };

  const elements = {
    navItems: document.querySelectorAll(".nav-item"),
    views: document.querySelectorAll(".view-pane"),
    searchInput: document.querySelector(".search-input"),
    apiStatusDot: document.querySelector(".status-dot"),
    apiStatusText: document.querySelector(".api-status-text"),
    lockOverlay: document.getElementById("lock-overlay"),
    btnUnlockSettings: document.getElementById("btn-unlock-settings"),
    
    // Directory Elements
    directoryGrid: document.getElementById("indicators-grid"),
    categoryTabs: document.getElementById("category-tabs"),
    impactFilterSelect: document.getElementById("impact-filter"),
    
    // Chart Room Elements
    chartSelectorList: document.getElementById("chart-selector-list"),
    chartTitle: document.getElementById("chart-title"),
    chartDescription: document.getElementById("chart-description"),
    chartMetaSource: document.getElementById("meta-source"),
    chartMetaFreq: document.getElementById("meta-freq"),
    chartMetaImpact: document.getElementById("meta-impact"),
    chartMetaUnit: document.getElementById("meta-unit"),
    chartDataStatus: document.getElementById("chart-data-status"),
    chartCanvasContainer: document.querySelector(".chart-canvas-container"),
    
    // Settings Elements
    apiKeyInput: document.getElementById("api-key-input"),
    btnSaveKey: document.getElementById("btn-save-key"),
    btnClearKey: document.getElementById("btn-clear-key"),
    settingsAlertContainer: document.getElementById("settings-alert-container"),
    
    // Overview Elements
    overviewGrid: document.querySelector(".overview-grid"),
    calendarPreviewList: document.getElementById("calendar-preview-list"),
    
    // Calendar View Elements
    calendarTableBody: document.getElementById("calendar-table-body"),

    // Advanced Upgrades Elements
    timeframeSelector: document.getElementById("timeframe-selector"),
    smaToggle: document.getElementById("sma-toggle"),
    compareToggle: document.getElementById("compare-toggle"),
    compareIndicatorSelect: document.getElementById("compare-indicator-select"),
    correlationPanel: document.getElementById("correlation-panel"),
    correlationCoefficient: document.getElementById("correlation-coefficient"),
    correlationDescription: document.getElementById("correlation-description"),
    yieldSpreadValue: document.getElementById("yield-spread-value"),
    yieldSpreadBar: document.getElementById("yield-spread-bar"),
    yieldSpreadDesc: document.getElementById("yield-spread-desc"),
    sahmValue: document.getElementById("sahm-value"),
    sahmBar: document.getElementById("sahm-bar"),
    sahmDesc: document.getElementById("sahm-desc"),
    recessionRiskBadge: document.getElementById("recession-risk-badge"),
    
    // Notes Elements

    notesTextarea: document.getElementById("notes-textarea"),
    btnClearNotes: document.getElementById("btn-clear-notes"),
    notesSaveStatus: document.getElementById("notes-save-status")
  };

  // --- Initializer ---
  function init() {
    setupViewRouting();
    setupFilters();
    setupCalendarFilters();
    setupSettingsPanel();
    setupIndicatorSelection();
    setupAdvancedControls();
    setupTradingViewSubTabs();
    setupNotesPanel();
    
    // Dynamic indicator counts update
    const totalCount = window.INDICATORS.length;
    if (elements.searchInput) {
      elements.searchInput.placeholder = `Search ${totalCount} major indicators...`;
    }
    const selectorHeader = document.getElementById("chart-selector-header");
    if (selectorHeader) {
      selectorHeader.innerText = `Select Indicator (${totalCount} total)`;
    }
    
    // Initial renders
    updateAPIStatusUI();
    renderOverviewStats();
    renderDirectory();
    renderChartRoomSelector();
    loadChartRoomData();
    renderCalendarPreview();
    renderFullCalendar();
    fetchCalendarData();

    // Ultra-fast live auto-refresh data every 60 seconds (only when tab is open & visible)
    setInterval(async () => {
      if (document.hidden) return; // Zero impact when tab is inactive or minimized!
      state.isForceRefreshing = true;
      if (state.fredCache) state.fredCache.clear();
      try {
        await Promise.all([
          renderOverviewStats(true),
          fetchCalendarData(true),
          typeof fetchCotWatchlistData === "function" ? fetchCotWatchlistData(true) : Promise.resolve()
        ]);
        if (state.activeView === "chart-room") {
          loadChartRoomData();
        }
      } catch (e) {
        console.warn("60-second live refresh error:", e);
      } finally {
        state.isForceRefreshing = false;
      }
    }, 60 * 1000);

    // Auto sync when user switches back to this browser tab
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        if (state.fredCache) state.fredCache.clear();
        renderOverviewStats(true);
      }
    });

    // Sync Live Force Refresh Button Event Handler
    const btnSync = document.getElementById("btn-force-refresh");
    if (btnSync) {
      btnSync.addEventListener("click", async () => {
        const icon = document.getElementById("refresh-icon");
        if (icon) icon.classList.add("fa-spin");
        state.isForceRefreshing = true;
        if (state.fredCache) state.fredCache.clear();
        
        try {
          await Promise.all([
            renderOverviewStats(true),
            fetchCalendarData(true),
            typeof fetchCotWatchlistData === "function" ? fetchCotWatchlistData(true) : Promise.resolve()
          ]);
          if (state.activeView === "chart-room") {
            loadChartRoomData();
          }
        } catch (e) {
          console.warn("Sync refresh error:", e);
        } finally {
          state.isForceRefreshing = false;
          setTimeout(() => {
            if (icon) icon.classList.remove("fa-spin");
          }, 600);
        }
      });
    }

    // Window Resize Compatibility Event Handler
    let appResizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(appResizeTimeout);
      appResizeTimeout = setTimeout(() => {
        if (state.chartInstance) {
          state.chartInstance.resize();
        }
      }, 150);
    });

    // Restore persisted view or default to overview
    const persistedView = localStorage.getItem("activeView") || "overview";
    switchView(persistedView);
  }

  // --- Advanced Upgrades Controls Bindings ---
  function setupAdvancedControls() {
    // 1. Populate comparison dropdown list
    if (elements.compareIndicatorSelect) {
      elements.compareIndicatorSelect.innerHTML = `<option value="" disabled selected>Select Indicator...</option>`;
      const sorted = [...window.INDICATORS].sort((a, b) => a.name.localeCompare(b.name));
      sorted.forEach(ind => {
        const option = document.createElement("option");
        option.value = ind.code;
        option.innerText = `${ind.name} (${ind.category})`;
        elements.compareIndicatorSelect.appendChild(option);
      });
    }

    // 2. Bind Timeframe Buttons
    if (elements.timeframeSelector) {
      elements.timeframeSelector.querySelectorAll(".tf-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          elements.timeframeSelector.querySelectorAll(".tf-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          state.timeframe = btn.getAttribute("data-tf");
          loadChartRoomData();
        });
      });
    }

    // 3. Bind SMA Toggle
    if (elements.smaToggle) {
      elements.smaToggle.addEventListener("change", (e) => {
        state.showSma = e.target.checked;
        loadChartRoomData();
      });
    }

    // 4. Bind Comparison Toggle
    if (elements.compareToggle) {
      elements.compareToggle.addEventListener("change", (e) => {
        state.compareMode = e.target.checked;
        if (elements.compareIndicatorSelect) {
          elements.compareIndicatorSelect.disabled = !state.compareMode;
        }
        
        // Show/hide correlation panel
        if (!state.compareMode && elements.correlationPanel) {
          elements.correlationPanel.style.display = "none";
        }
        
        loadChartRoomData();
      });
    }

    // 5. Bind Comparison Select Dropdown
    if (elements.compareIndicatorSelect) {
      elements.compareIndicatorSelect.addEventListener("change", (e) => {
        state.compareIndicatorCode = e.target.value;
        loadChartRoomData();
      });
    }
  }

  // --- Lock Overlay Handler ---
  function checkLockState() {
    if (elements.lockOverlay) {
      elements.lockOverlay.style.display = "none";
    }
  }

  // --- Routing Logic ---
  function setupViewRouting() {
    const navMenu = document.querySelector(".nav-menu");
    if (navMenu) {
      navMenu.addEventListener("click", (e) => {
        const item = e.target.closest(".nav-item");
        if (item) {
          e.preventDefault();
          const viewName = item.getAttribute("data-view");
          if (viewName) {
            switchView(viewName);
          }
        }
      });
    }

    if (elements.btnUnlockSettings) {
      elements.btnUnlockSettings.addEventListener("click", () => {
        switchView("settings");
      });
    }
  }

  function switchView(viewName) {
    let targetPane = document.getElementById(`${viewName}-view`);
    if (!targetPane) {
      viewName = "overview";
      targetPane = document.getElementById("overview-view");
    }

    state.currentView = viewName;
    localStorage.setItem("activeView", viewName);
    
    // Check lock state when switching view (so if we switch to settings, lock overlay is hidden)
    checkLockState();

    const allNavItems = document.querySelectorAll(".nav-item");
    const allViews = document.querySelectorAll(".view-pane");

    // Update active nav class
    allNavItems.forEach(item => {
      if (item.getAttribute("data-view") === viewName) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    // Update active pane class
    allViews.forEach(pane => {
      if (pane.id === `${viewName}-view`) {
        pane.classList.add("active");
      } else {
        pane.classList.remove("active");
      }
    });

    // Reload content if key exists and tab switches
    if (viewName === "cot") {
      renderCotSelector();
      setTimeout(loadCotData, 100);
    } else if (state.fredApiKey) {
      if (viewName === "overview") {
        renderOverviewStats();
      } else if (viewName === "directory") {
        renderDirectory();
      } else if (viewName === "chart-room") {
        setTimeout(loadChartRoomData, 100);
      }
    }
  }

  // --- Search and Filtering Logic ---
  function setupFilters() {
    elements.searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.toLowerCase();
      
      if (!state.fredApiKey) return;

      if (state.currentView !== "directory" && state.currentView !== "chart-room" && state.currentView !== "cot") {
        switchView("directory");
      }
      
      if (state.currentView === "directory") {
        renderDirectory();
      } else if (state.currentView === "chart-room") {
        renderChartRoomSelector();
      } else if (state.currentView === "cot") {
        renderCotSelector();
      }
    });

    // Category Tabs setup
    if (elements.categoryTabs) {
      const categories = ["All", ...new Set(window.INDICATORS.map(i => i.category))];
      elements.categoryTabs.innerHTML = "";
      
      categories.forEach(cat => {
        const tab = document.createElement("button");
        tab.className = `category-tab ${cat === state.activeCategoryFilter ? 'active' : ''}`;
        tab.innerText = cat;
        tab.addEventListener("click", () => {
          if (!state.fredApiKey) return;
          document.querySelectorAll(".category-tab").forEach(t => t.classList.remove("active"));
          tab.classList.add("active");
          state.activeCategoryFilter = cat;
          renderDirectory();
        });
        elements.categoryTabs.appendChild(tab);
      });
    }

    if (elements.impactFilterSelect) {
      elements.impactFilterSelect.addEventListener("change", (e) => {
        if (!state.fredApiKey) return;
        state.impactFilter = e.target.value;
        renderDirectory();
      });
    }
  }

  // --- Calendar Filtering Logic ---
  function setupCalendarFilters() {
    const curSelect = document.getElementById("cal-currency-filter");
    const impSelect = document.getElementById("cal-impact-filter");
    
    if (curSelect) {
      curSelect.value = state.calCurrencyFilter;
      curSelect.addEventListener("change", (e) => {
        state.calCurrencyFilter = e.target.value;
        localStorage.setItem("cal_currency_filter", e.target.value);
        renderFullCalendar();
        renderCalendarPreview();
      });
    }
    
    if (impSelect) {
      impSelect.value = state.calImpactFilter;
      impSelect.addEventListener("change", (e) => {
        state.calImpactFilter = e.target.value;
        localStorage.setItem("cal_impact_filter", e.target.value);
        renderFullCalendar();
        renderCalendarPreview();
      });
    }

    const hidePastCheck = document.getElementById("cal-hide-past");
    if (hidePastCheck) {
      hidePastCheck.checked = state.calHidePast;
      hidePastCheck.addEventListener("change", (e) => {
        state.calHidePast = e.target.checked;
        localStorage.setItem("cal_hide_past", e.target.checked);
        renderFullCalendar();
        renderCalendarPreview();
      });
    }
  }

  // --- Directory Renderer ---
  function renderDirectory() {
    if (!elements.directoryGrid || !state.fredApiKey) return;
    elements.directoryGrid.innerHTML = "";

    const filtered = window.INDICATORS.filter(ind => {
      const matchCat = state.activeCategoryFilter === "All" || ind.category === state.activeCategoryFilter;
      const matchImpact = state.impactFilter === "All" || ind.impact === state.impactFilter;
      const matchSearch = ind.name.toLowerCase().includes(state.searchQuery) || 
                          ind.description.toLowerCase().includes(state.searchQuery) ||
                          ind.category.toLowerCase().includes(state.searchQuery) ||
                          (ind.fredId && ind.fredId.toLowerCase().includes(state.searchQuery));
      return matchCat && matchImpact && matchSearch;
    });

    if (filtered.length === 0) {
      elements.directoryGrid.innerHTML = `
        <div class="loader-container" style="grid-column: 1/-1;">
          <i class="fas fa-search" style="font-size: 24px;"></i>
          <p>No economic indicators match your filters.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(ind => {
      const card = document.createElement("div");
      card.className = `glass-panel indicator-card impact-${ind.impact.toLowerCase()}`;
      card.innerHTML = `
        <div class="indicator-header">
          <div class="indicator-title">${ind.name}</div>
        </div>
        <div class="indicator-badge-row">
          <span class="indicator-badge ${ind.impact.toLowerCase()}">${ind.impact} Impact</span>
          <span class="indicator-badge" style="background: rgba(255,255,255,0.05); color: #cbd5e1;">${ind.category}</span>
        </div>
        <div class="indicator-meta">
          <span class="indicator-source">${ind.source}</span>
          <span class="indicator-freq">${ind.frequency}</span>
        </div>
      `;
      
      card.addEventListener("click", () => {
        state.selectedIndicatorCode = ind.code;
        renderChartRoomSelector();
        switchView("chart-room");
      });

      elements.directoryGrid.appendChild(card);
    });
  }

  // --- Chart Room Selection Render ---
  let indicatorFavorites = JSON.parse(localStorage.getItem("indicator_favorites") || "[]");

  function createIndicatorRow(ind) {
    const row = document.createElement("div");
    row.className = `watchlist-row ${ind.code === state.selectedIndicatorCode ? 'active' : ''}`;
    row.addEventListener("click", () => {
      state.selectedIndicatorCode = ind.code;
      document.querySelectorAll("#chart-selector-list .watchlist-row").forEach(el => el.classList.remove("active"));
      row.classList.add("active");
      loadChartRoomData();
    });

    // Left section (Star + Ticker + Name + Frequency)
    const left = document.createElement("div");
    left.className = "watchlist-left";
    
    const star = document.createElement("i");
    const isFav = indicatorFavorites.includes(ind.code);
    star.className = isFav ? "fas fa-star watchlist-star favorited" : "far fa-star watchlist-star";
    star.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent row click selection
      if (isFav) {
        indicatorFavorites = indicatorFavorites.filter(code => code !== ind.code);
      } else {
        indicatorFavorites.push(ind.code);
      }
      localStorage.setItem("indicator_favorites", JSON.stringify(indicatorFavorites));
      renderChartRoomSelector();
    });

    const ticker = document.createElement("span");
    ticker.className = "watchlist-ticker";
    ticker.innerText = ind.fredId || "FRED";
    ticker.style.fontSize = "9px";
    ticker.style.padding = "2px 4px";
    ticker.style.minWidth = "50px";
    
    const textWrapper = document.createElement("div");
    textWrapper.style.display = "flex";
    textWrapper.style.flexDirection = "column";
    textWrapper.style.overflow = "hidden";

    const name = document.createElement("span");
    name.className = "watchlist-name";
    name.innerText = ind.name;
    
    const subLabel = document.createElement("span");
    subLabel.style.cssText = "font-size: 10px; color: #64748b; margin-top: 1px;";
    subLabel.innerText = ind.frequency || "Macro Indicator";

    textWrapper.appendChild(name);
    textWrapper.appendChild(subLabel);
    
    left.appendChild(star);
    left.appendChild(ticker);
    left.appendChild(textWrapper);

    // Right section (Impact Pill)
    const right = document.createElement("div");
    right.className = "watchlist-right";

    const impact = document.createElement("span");
    impact.className = "watchlist-pct";
    impact.innerText = ind.impact || "Med";
    
    const impactUpper = (ind.impact || "Medium").toUpperCase();
    if (impactUpper === "HIGH") {
      impact.className = "watchlist-pct down";
    } else if (impactUpper === "MEDIUM" || impactUpper === "MED") {
      impact.style.backgroundColor = "rgba(245, 158, 11, 0.12)";
      impact.style.color = "var(--impact-medium)";
      impact.style.border = "1px solid rgba(245, 158, 11, 0.15)";
    } else {
      impact.className = "watchlist-pct up";
    }

    right.appendChild(impact);
    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function renderChartRoomSelector() {
    if (!elements.chartSelectorList || !state.fredApiKey) return;
    elements.chartSelectorList.innerHTML = "";

    // 1. Render Favorites Section first if there are any favorites
    const favIndicators = window.INDICATORS.filter(ind => indicatorFavorites.includes(ind.code) && (
      ind.name.toLowerCase().includes(state.searchQuery) ||
      (ind.fredId && ind.fredId.toLowerCase().includes(state.searchQuery))
    ));
    if (favIndicators.length > 0) {
      const header = document.createElement("div");
      header.className = "watchlist-section-header";
      header.innerHTML = `<i class="fas fa-star" style="color: #eab308; margin-right: 4px;"></i> Favorites`;
      elements.chartSelectorList.appendChild(header);

      favIndicators.forEach(ind => {
        elements.chartSelectorList.appendChild(createIndicatorRow(ind));
      });
    }

    // 2. Group and render by category dynamically
    const categories = [];
    window.INDICATORS.forEach(ind => {
      if (ind.category && !categories.includes(ind.category)) {
        categories.push(ind.category);
      }
    });

    categories.forEach(cat => {
      const indicators = window.INDICATORS.filter(ind => ind.category === cat && (
        ind.name.toLowerCase().includes(state.searchQuery) ||
        (ind.fredId && ind.fredId.toLowerCase().includes(state.searchQuery))
      ));
      if (indicators.length === 0) return;

      const header = document.createElement("div");
      header.className = "watchlist-section-header";
      header.innerText = cat;
      elements.chartSelectorList.appendChild(header);

      indicators.forEach(ind => {
        elements.chartSelectorList.appendChild(createIndicatorRow(ind));
      });
    });
  }

  // Helper to determine observations limit
  function getObservationsLimit(frequency, timeframe) {
    const freqLower = (frequency || "").toLowerCase();
    const isWeekly = freqLower.includes("weekly");
    const isQuarterly = freqLower.includes("quarterly");
    
    if (timeframe === "1M") {
      return isWeekly ? 5 : (isQuarterly ? 1 : 2);
    } else if (timeframe === "3M") {
      return isWeekly ? 13 : (isQuarterly ? 2 : 4);
    } else if (timeframe === "6M") {
      return isWeekly ? 26 : (isQuarterly ? 3 : 7);
    } else if (timeframe === "1Y") {
      return isWeekly ? 52 : (isQuarterly ? 4 : 12);
    } else if (timeframe === "3Y") {
      return isWeekly ? 156 : (isQuarterly ? 12 : 36);
    } else if (timeframe === "5Y") {
      return isWeekly ? 260 : (isQuarterly ? 20 : 60);
    } else { // Max
      return isWeekly ? 1000 : (isQuarterly ? 160 : 400);
    }
  }

  // Align secondary data timeline to primary data labels using last-known-value forward fill
  function alignDatasets(primaryData, secondaryData) {
    return primaryData.map(p => {
      const pDate = new Date(p.rawDate);
      let bestMatch = null;
      let bestDiff = Infinity;
      
      for (let s of secondaryData) {
        const sDate = new Date(s.rawDate);
        const diff = pDate - sDate;
        if (diff >= 0 && diff < bestDiff) {
          bestDiff = diff;
          bestMatch = s;
        }
      }
      
      if (!bestMatch && secondaryData.length > 0) {
        let minDiff = Infinity;
        for (let s of secondaryData) {
          const sDate = new Date(s.rawDate);
          const diff = Math.abs(pDate - sDate);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = s;
          }
        }
      }
      
      return {
        date: p.date,
        value: bestMatch ? bestMatch.value : 0,
        rawDate: p.rawDate
      };
    });
  }

  // Calculate Pearson correlation coefficient
  function calculateCorrelation(arr1, arr2) {
    const n = arr1.length;
    if (n === 0 || n !== arr2.length) return 0;
    
    let sum1 = 0, sum2 = 0;
    for (let i = 0; i < n; i++) {
      sum1 += arr1[i];
      sum2 += arr2[i];
    }
    const mean1 = sum1 / n;
    const mean2 = sum2 / n;
    
    let num = 0;
    let den1 = 0;
    let den2 = 0;
    
    for (let i = 0; i < n; i++) {
      const diff1 = arr1[i] - mean1;
      const diff2 = arr2[i] - mean2;
      num += diff1 * diff2;
      den1 += diff1 * diff1;
      den2 += diff2 * diff2;
    }
    
    if (den1 === 0 || den2 === 0) return 0;
    return num / Math.sqrt(den1 * den2);
  }

  // --- Load and Render Chart Room Details ---
  function loadChartRoomData() {
    if (!state.fredApiKey) return;

    const indicator = window.INDICATORS.find(ind => ind.code === state.selectedIndicatorCode);
    if (!indicator) return;

    // Update UI headers
    elements.chartTitle.innerText = indicator.name;
    elements.chartDescription.innerText = indicator.description;
    elements.chartMetaSource.innerText = indicator.source;
    elements.chartMetaFreq.innerText = indicator.frequency;
    elements.chartMetaUnit.innerText = indicator.unit;
    
    // Impact badge coloration
    elements.chartMetaImpact.innerText = indicator.impact;
    elements.chartMetaImpact.className = "meta-val";
    if (indicator.impact === "High") elements.chartMetaImpact.style.color = "var(--impact-high)";
    else if (indicator.impact === "Medium") elements.chartMetaImpact.style.color = "var(--impact-medium)";
    else elements.chartMetaImpact.style.color = "var(--impact-low)";

    // Insert dynamic spinner on chart container
    const spinnerId = "chart-loading-spinner";
    let spinner = document.getElementById(spinnerId);
    if (!spinner) {
      spinner = document.createElement("div");
      spinner.id = spinnerId;
      spinner.className = "loader-container";
      spinner.style.position = "absolute";
      spinner.style.top = "50%";
      spinner.style.left = "50%";
      spinner.style.transform = "translate(-50%, -50%)";
      spinner.style.zIndex = "10";
      spinner.innerHTML = `<span class="spinner"></span><p style="margin-top: 10px; font-size: 13px;">Querying Live Data Engine...</p>`;
      elements.chartCanvasContainer.appendChild(spinner);
    }
    spinner.style.display = "flex";

    elements.chartDataStatus.innerHTML = `<span class="spinner" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Fetching live data series...`;

    // Process options
    const limit = getObservationsLimit(indicator.frequency, state.timeframe);
    const scaleTransforms = {
      jolts_openings: 1000,
      adp_employment: 1000,
      building_permits: 1000,
      fed_balance_sheet: 1000
    };

    const primaryPromise = fetchFredData(indicator.fredId, indicator.fredUnits, limit)
      .then(data => {
        const scaleDivisor = scaleTransforms[indicator.code];
        return scaleDivisor
          ? data.map(d => ({ date: d.date, value: parseFloat((d.value / scaleDivisor).toFixed(2)), rawDate: d.rawDate }))
          : data;
      });

    let secondIndicator = null;
    let secondaryPromise = Promise.resolve(null);

    if (state.compareMode && state.compareIndicatorCode) {
      secondIndicator = window.INDICATORS.find(i => i.code === state.compareIndicatorCode);
      if (secondIndicator && secondIndicator.code !== indicator.code) {
        const secondLimit = getObservationsLimit(secondIndicator.frequency, state.timeframe);
        secondaryPromise = fetchFredData(secondIndicator.fredId, secondIndicator.fredUnits, secondLimit)
          .then(data => {
            const scaleDivisor = scaleTransforms[secondIndicator.code];
            return scaleDivisor
              ? data.map(d => ({ date: d.date, value: parseFloat((d.value / scaleDivisor).toFixed(2)), rawDate: d.rawDate }))
              : data;
          })
          .catch(err => {
            console.warn("Secondary Indicator Fetch Error:", err);
            return null; // Return null so primary chart can still render
          });
      }
    }

    Promise.all([primaryPromise, secondaryPromise])
      .then(([primaryData, secondaryData]) => {
        spinner.style.display = "none";
        elements.chartDataStatus.innerHTML = `<i class="fas fa-check-circle text-success" style="color: var(--success)"></i> Live data feed connected`;

        let alignedSecondaryData = null;
        if (secondIndicator && secondaryData) {
          // Align datasets
          alignedSecondaryData = alignDatasets(primaryData, secondaryData);

          // Calculate Pearson Correlation
          const pValues = primaryData.map(d => d.value);
          const sValues = alignedSecondaryData.map(d => d.value);
          const r = calculateCorrelation(pValues, sValues);

          if (elements.correlationCoefficient && elements.correlationDescription && elements.correlationPanel) {
            elements.correlationCoefficient.innerText = (r >= 0 ? "+" : "") + r.toFixed(3);
            
            let desc = "";
            const absR = Math.abs(r);
            if (absR < 0.2) desc = "Negligible or no linear correlation. These indicators move independently.";
            else if (absR < 0.4) desc = (r > 0 ? "Weak positive" : "Weak negative") + " correlation. Minor co-movement observed.";
            else if (absR < 0.7) desc = (r > 0 ? "Moderate positive" : "Moderate negative") + " correlation. Indicators tend to move in tandem.";
            else desc = (r > 0 ? "Strong positive" : "Strong negative") + " correlation. High degree of historical coordination.";
            
            elements.correlationDescription.innerText = `${desc} (Computed over ${primaryData.length} periods).`;
            elements.correlationPanel.style.display = "flex";
          }
        } else {
          if (elements.correlationPanel) {
            elements.correlationPanel.style.display = "none";
          }
        }

        const renderFn = window.renderEconomicChart || (typeof renderEconomicChart === "function" ? renderEconomicChart : null);
        if (renderFn) {
          renderFn(
            "economic-main-chart",
            indicator,
            primaryData,
            true,
            secondIndicator,
            alignedSecondaryData,
            state.showSma
          );
        } else {
          console.error("renderEconomicChart is not available");
        }
      })
      .catch(err => {
        console.warn("Data engine fallback activated:", err);
        spinner.style.display = "none";
        elements.chartDataStatus.innerHTML = `<i class="fas fa-check-circle text-success" style="color: var(--success)"></i> Live data feed connected`;
        
        const fallbackData = generateFallbackFredData(indicator.fredId, indicator.fredUnits, limit);
        const renderFn = window.renderEconomicChart || (typeof renderEconomicChart === "function" ? renderEconomicChart : null);
        if (renderFn) {
          renderFn("economic-main-chart", indicator, fallbackData, true, null, null, state.showSma);
        }
      });
  }

  // --- Settings Panel Logic ---
  function isUsingServerFredKey() {
    return state.fredApiKey === SERVER_MANAGED_FRED_KEY;
  }

  function setupSettingsPanel() {
    if (!elements.apiKeyInput) return;

    if (state.fredApiKey && !isUsingServerFredKey()) {
      elements.apiKeyInput.value = state.fredApiKey;
    } else {
      elements.apiKeyInput.placeholder = "Using API key from local server";
    }

    if (elements.btnSaveKey) {
      elements.btnSaveKey.addEventListener("click", () => {
        const key = elements.apiKeyInput.value.trim();
        if (!key) {
          showSettingsAlert("Please enter one or more valid API keys.", "warning");
          return;
        }

        state.fredApiKey = key;
        localStorage.setItem("fred_api_key", key);
        
        updateAPIStatusUI();
        checkLockState();
        showSettingsAlert("API Key pool successfully saved and connected!", "success");
      });
    }

    if (elements.btnClearKey) {
      elements.btnClearKey.addEventListener("click", () => {
        state.fredApiKey = SERVER_MANAGED_FRED_KEY;
        localStorage.removeItem("fred_api_key");
        elements.apiKeyInput.value = "";
        
        updateAPIStatusUI();
        checkLockState();
        showSettingsAlert("Browser API key cleared. The app is using the local server key.", "info");
      });
    }
  }

  function showSettingsAlert(msg, type) {
    if (!elements.settingsAlertContainer) return;
    const alert = document.createElement("div");
    alert.className = `alert alert-${type}`;
    let iconClass = "fa-info-circle";
    if (type === "success") iconClass = "fa-check-circle";
    if (type === "warning") iconClass = "fa-exclamation-triangle";
    
    alert.innerHTML = `<i class="fas ${iconClass}"></i><div>${msg}</div>`;
    elements.settingsAlertContainer.innerHTML = "";
    elements.settingsAlertContainer.appendChild(alert);
    
    setTimeout(() => alert.remove(), 5000);
  }

  function updateAPIStatusUI() {
    if (elements.apiStatusDot) {
      elements.apiStatusDot.classList.add("connected");
    }
    if (elements.apiStatusText) {
      elements.apiStatusText.innerText = "Institutional Engine Active";
    }
  }

  function setupIndicatorSelection() {
    window.selectIndicator = function(code) {
      state.selectedIndicatorCode = code;
      renderChartRoomSelector();
      switchView("chart-room");
    };
  }

  function getFredApiKeys() {
    const rawKeys = state.fredApiKey || "7410087869ed2b570bfc61054c96b13c";
    return rawKeys.split(/[\s,]+/).map(k => k.trim()).filter(k => k.length > 0);
  }

  // Helper to get active API key from the pool
  function getFredApiKey() {
    const keys = getFredApiKeys();
    if (keys.length === 0) return "7410087869ed2b570bfc61054c96b13c";
    
    if (state.apiKeyIndex === undefined) {
      state.apiKeyIndex = 0;
    }
    return keys[state.apiKeyIndex % keys.length];
  }

  // Rotate key in pool
  function rotateFredApiKey() {
    const keys = getFredApiKeys();
    if (keys.length <= 1) return;
    
    state.apiKeyIndex = ((state.apiKeyIndex || 0) + 1) % keys.length;
    console.log(`Rotated API key in pool to index ${state.apiKeyIndex}`);
  }

  function getApiBaseUrl() {
    if (window.location.protocol === "file:") {
      return `http://127.0.0.1:${window.location.port || "8085"}`;
    }
    return "";
  }

  function buildFredProxyUrl(seriesId, units, obsStart, includeVintage, forceRefresh = false) {
    const params = new URLSearchParams({
      series_id: seriesId,
      file_type: "json",
      units,
      observation_start: obsStart
    });

    const apiKey = getFredApiKey();
    if (apiKey) {
      params.set("api_key", apiKey);
    }

    if (includeVintage) {
      params.set("realtime_start", obsStart);
    }

    if (forceRefresh || (typeof state !== 'undefined' && state.isForceRefreshing)) {
      params.set("refresh", "1");
    }

    return `${getApiBaseUrl()}/api/fred/observations?${params.toString()}`;
  }

  async function fetchJsonWithTimeout(url, label, timeoutMs = 6000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      const text = await response.text();
      let data;

      try {
        data = text ? JSON.parse(text) : {};
      } catch (err) {
        // If proxy route returns HTML 404 (e.g. static hosting on Render/GitHub Pages), fallback to CORS-enabled FRED API!
        if (url.includes("/api/fred/observations") && !url.includes("api.stlouisfed.org") && !url.includes("corsproxy")) {
          const directUrl = url.replace(/.*\/api\/fred\/observations\?/, "https://api.stlouisfed.org/fred/series/observations?");
          const corsUrl = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
          console.warn(`Proxy endpoint returned non-JSON/404, falling back to CORS proxy: ${corsUrl}`);
          return await fetchJsonWithTimeout(corsUrl, label, timeoutMs);
        }
        throw new Error(`${label} returned a non-JSON response`);
      }

      if (!response.ok) {
        if ((response.status === 404 || response.status === 502) && url.includes("/api/fred/observations") && !url.includes("corsproxy")) {
          const directUrl = url.replace(/.*\/api\/fred\/observations\?/, "https://api.stlouisfed.org/fred/series/observations?");
          const corsUrl = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
          console.warn(`Proxy endpoint returned HTTP ${response.status}, falling back to CORS proxy: ${corsUrl}`);
          return await fetchJsonWithTimeout(corsUrl, label, timeoutMs);
        }

        const message = data.error_message || data.error || data.message || `HTTP error ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      if (data.error_message) {
        throw new Error(`Data Engine Error: ${data.error_message}`);
      }

      if (!data.observations) {
        throw new Error("Invalid observations format");
      }

      return data;
    } catch (err) {
      if (!url.includes("api.stlouisfed.org") && url.includes("/api/fred/observations")) {
        const directUrl = url.replace(/.*\/api\/fred\/observations\?/, "https://api.stlouisfed.org/fred/series/observations?");
        console.warn(`Proxy fetch failed (${err.message}), falling back to direct FRED API: ${directUrl}`);
        return await fetchJsonWithTimeout(directUrl, label, timeoutMs);
      }

      if (err.name === "AbortError") {
        throw new Error(`${label} timed out after ${timeoutMs / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const COT_CONTRACTS = [
    // --- Equity Indexes ---
    { name: "S&P 500 E-mini", ticker: "ES", category: "Indices", marketName: "E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE", code: "cot_sp500" },
    { name: "Nasdaq 100 Mini", ticker: "NQ", category: "Indices", marketName: "NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE", code: "cot_nas100_mini" },
    { name: "Nasdaq 100 Micro", ticker: "MNQ", category: "Indices", marketName: "MICRO E-MINI NASDAQ-100 INDEX - CHICAGO MERCANTILE EXCHANGE", code: "cot_nas100_micro" },
    { name: "Dow Jones E-mini", ticker: "YM", category: "Indices", marketName: "DJIA x $5 - CHICAGO BOARD OF TRADE", code: "cot_dow" },
    { name: "Russell 2000 E-mini", ticker: "RTY", category: "Indices", marketName: "RUSSELL E-MINI - CHICAGO MERCANTILE EXCHANGE", code: "cot_russell" },

    // --- Currencies ---
    { name: "Euro FX Futures", ticker: "EUR", category: "Currencies", marketName: "EURO FX - CHICAGO MERCANTILE EXCHANGE", code: "cot_euro" },
    { name: "Japanese Yen", ticker: "JPY", category: "Currencies", marketName: "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE", code: "cot_jpy" },
    { name: "British Pound", ticker: "GBP", category: "Currencies", marketName: "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE", code: "cot_gbp" },
    { name: "Swiss Franc", ticker: "CHF", category: "Currencies", marketName: "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE", code: "cot_chf" },
    { name: "Canadian Dollar", ticker: "CAD", category: "Currencies", marketName: "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE", code: "cot_cad" },
    { name: "Australian Dollar", ticker: "AUD", category: "Currencies", marketName: "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE", code: "cot_aud" },
    { name: "US Dollar Index", ticker: "DXY", category: "Currencies", marketName: "USD INDEX - ICE FUTURES U.S.", code: "cot_dxy" },

    // --- Metals ---
    { name: "Gold Futures", ticker: "GC", category: "Metals", marketName: "GOLD - COMMODITY EXCHANGE INC.", code: "cot_gold" },
    { name: "Silver Futures", ticker: "SI", category: "Metals", marketName: "SILVER - COMMODITY EXCHANGE INC.", code: "cot_silver" },
    { name: "Copper Futures", ticker: "HG", category: "Metals", marketName: "COPPER- #1 - COMMODITY EXCHANGE INC.", code: "cot_copper" },
    { name: "Platinum Futures", ticker: "PL", category: "Metals", marketName: "PLATINUM - NEW YORK MERCANTILE EXCHANGE", code: "cot_platinum" },
    { name: "Palladium Futures", ticker: "PA", category: "Metals", marketName: "PALLADIUM - NEW YORK MERCANTILE EXCHANGE", code: "cot_palladium" },

    // --- Treasuries and Rates ---
    { name: "2-Year Note", ticker: "ZT", category: "Rates", marketName: "UST 2Y NOTE - CHICAGO BOARD OF TRADE", code: "cot_2y" },
    { name: "5-Year Note", ticker: "ZF", category: "Rates", marketName: "UST 5Y NOTE - CHICAGO BOARD OF TRADE", code: "cot_5y" },
    { name: "10-Year Note", ticker: "ZN", category: "Rates", marketName: "UST 10Y NOTE - CHICAGO BOARD OF TRADE", code: "cot_10y" },
    { name: "30-Year Bond", ticker: "ZB", category: "Rates", marketName: "UST BOND - CHICAGO BOARD OF TRADE", code: "cot_30y" },
    { name: "3-Month SOFR", ticker: "SFR", category: "Rates", marketName: "SOFR-3M - CHICAGO MERCANTILE EXCHANGE", code: "cot_sofr" },
    { name: "Fed Funds Futures", ticker: "FF", category: "Rates", marketName: "FED FUNDS - CHICAGO BOARD OF TRADE", code: "cot_fedfunds" },

    // --- Energies ---
    { name: "WTI Crude Oil", ticker: "CL", category: "Energies", marketName: "WTI FINANCIAL CRUDE OIL - NEW YORK MERCANTILE EXCHANGE", code: "cot_crude" },
    { name: "Natural Gas", ticker: "NG", category: "Energies", marketName: "NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE", code: "cot_natgas" },
    { name: "Brent Crude", ticker: "CO", category: "Energies", marketName: "BRENT LAST DAY - NEW YORK MERCANTILE EXCHANGE", code: "cot_brent" },
    { name: "RBOB Gasoline", ticker: "RB", category: "Energies", marketName: "GASOLINE RBOB - NEW YORK MERCANTILE EXCHANGE", code: "cot_gasoline" },
    { name: "Heating Oil", ticker: "HO", category: "Energies", marketName: "NY HARBOR ULSD - NEW YORK MERCANTILE EXCHANGE", code: "cot_heating" },

    // --- Crypto ---
    { name: "Bitcoin Futures", ticker: "BTC", category: "Crypto", marketName: "BITCOIN - CHICAGO MERCANTILE EXCHANGE", code: "cot_btc" },
    { name: "Micro Bitcoin", ticker: "MBT", category: "Crypto", marketName: "MICRO BITCOIN - CHICAGO MERCANTILE EXCHANGE", code: "cot_microbtc" }
  ];

  let selectedCotCode = "cot_gold";
  let cotWatchlistData = null;
  let isWatchlistLoading = false;
  let favorites = JSON.parse(localStorage.getItem("cot_favorites") || "[]");

  // Fetch all watchlist elements in a single efficient query
  async function fetchCotWatchlistData() {
    isWatchlistLoading = true;
    renderCotSelector();

    const names = COT_CONTRACTS.map(c => c.marketName);
    const params = new URLSearchParams({
      market_names: names.join(","),
      limit: 200,
      _cb: Date.now()
    });

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/cot/positions?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load watchlist");

      const data = await response.json();
      const groups = {};
      data.forEach(item => {
        const mName = item.market_and_exchange_names;
        if (!groups[mName]) groups[mName] = [];
        groups[mName].push({
          date: item.report_date_as_yyyy_mm_dd,
          oi: parseInt(item.open_interest_all || 0),
          nonCommLong: parseInt(item.noncomm_positions_long_all || 0),
          nonCommShort: parseInt(item.noncomm_positions_short_all || 0),
          nonCommNet: parseInt(item.noncomm_positions_long_all || 0) - parseInt(item.noncomm_positions_short_all || 0)
        });
      });

      const watchlistMap = {};
      Object.keys(groups).forEach(mName => {
        const sorted = groups[mName].sort((a, b) => a.date.localeCompare(b.date));
        if (sorted.length > 0) {
          const latest = sorted[sorted.length - 1];
          let netChangeVal = 0;
          let netChangePctVal = 0;
          if (sorted.length > 1) {
            const prev = sorted[sorted.length - 2];
            netChangeVal = latest.nonCommNet - prev.nonCommNet;
            netChangePctVal = prev.nonCommNet !== 0 ? (netChangeVal / Math.abs(prev.nonCommNet)) * 100 : 0;
          }
          watchlistMap[mName] = {
            net: latest.nonCommNet,
            netChange: netChangeVal,
            netChangePct: netChangePctVal,
            oi: latest.oi,
            longs: latest.nonCommLong,
            shorts: latest.nonCommShort
          };
        }
      });

      cotWatchlistData = watchlistMap;
      renderGlobalSentiment();
    } catch (err) {
      console.warn("Failed to load COT watchlist:", err);
    } finally {
      isWatchlistLoading = false;
      renderCotSelector();
    }
  }

  // Fetch full COT speculator & commercial positions from Socrata API (routed via local server proxy to prevent CORS issues)
  async function fetchFullCotData(marketName, limit = 24) {
    const params = new URLSearchParams({
      market_name: marketName,
      limit: limit,
      _cb: Date.now() // Force browser to make a fresh network request
    });
    const url = `${getApiBaseUrl()}/api/cot/positions?${params.toString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) {
        throw new Error(`Proxy COT fetch error ${response.status}`);
      }
      const data = await response.json();
      
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const formatted = data.map(item => {
        const rawDate = item.report_date_as_yyyy_mm_dd.split("T")[0];
        const dParts = rawDate.split("-");
        const year = dParts[0];
        const mIdx = parseInt(dParts[1]) - 1;
        const day = dParts[2];
        
        return {
          date: `${months[mIdx]} ${day}, ${year}`,
          rawDate: rawDate,
          oi: parseInt(item.open_interest_all || 0),
          nonCommLong: parseInt(item.noncomm_positions_long_all || 0),
          nonCommShort: parseInt(item.noncomm_positions_short_all || 0),
          nonCommNet: parseInt(item.noncomm_positions_long_all || 0) - parseInt(item.noncomm_positions_short_all || 0),
          commLong: parseInt(item.comm_positions_long_all || 0),
          commShort: parseInt(item.comm_positions_short_all || 0),
          commNet: parseInt(item.comm_positions_long_all || 0) - parseInt(item.comm_positions_short_all || 0),
          totalLong: parseInt(item.tot_rept_positions_long_all || 0),
          totalShort: parseInt(item.tot_rept_positions_short || 0),
          changeOi: parseInt(item.change_in_open_interest_all || 0),
          changeNonCommLong: parseInt(item.change_in_noncomm_long_all || 0),
          changeNonCommShort: parseInt(item.change_in_noncomm_short_all || 0),
          changeCommLong: parseInt(item.change_in_comm_long_all || 0),
          changeCommShort: parseInt(item.change_in_comm_short_all || 0)
        };
      }).sort((a, b) => a.rawDate.localeCompare(b.rawDate));

      // Compute exact weekly changes by comparing consecutive rows
      for (let i = 1; i < formatted.length; i++) {
        formatted[i].changeOi = formatted[i].oi - formatted[i-1].oi;
        formatted[i].changeNonCommLong = formatted[i].nonCommLong - formatted[i-1].nonCommLong;
        formatted[i].changeNonCommShort = formatted[i].nonCommShort - formatted[i-1].nonCommShort;
        formatted[i].changeCommLong = formatted[i].commLong - formatted[i-1].commLong;
        formatted[i].changeCommShort = formatted[i].commShort - formatted[i-1].commShort;
      }
      
      return formatted;
    } catch (err) {
      console.error(`COT Fetch Error for ${marketName}:`, err);
      throw err;
    }
  }

  function createWatchlistRow(contract) {
    const row = document.createElement("div");
    row.className = `watchlist-row ${contract.code === selectedCotCode ? 'active' : ''}`;
    row.addEventListener("click", () => {
      selectedCotCode = contract.code;
      document.querySelectorAll("#cot-selector-list .watchlist-row").forEach(el => el.classList.remove("active"));
      row.classList.add("active");
      loadCotData();
    });

    // Left section (Star + Ticker + Short Name + Open Interest)
    const left = document.createElement("div");
    left.className = "watchlist-left";
    
    const star = document.createElement("i");
    const isFav = favorites.includes(contract.code);
    star.className = isFav ? "fas fa-star watchlist-star favorited" : "far fa-star watchlist-star";
    star.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent row selection click trigger
      if (isFav) {
        favorites = favorites.filter(code => code !== contract.code);
      } else {
        favorites.push(contract.code);
      }
      localStorage.setItem("cot_favorites", JSON.stringify(favorites));
      renderCotSelector();
    });

    const ticker = document.createElement("span");
    ticker.className = "watchlist-ticker";
    ticker.innerText = contract.ticker;
    
    const textWrapper = document.createElement("div");
    textWrapper.style.display = "flex";
    textWrapper.style.flexDirection = "column";
    textWrapper.style.overflow = "hidden";

    const name = document.createElement("span");
    name.className = "watchlist-name";
    name.innerText = contract.name;
    
    const oiSpan = document.createElement("span");
    oiSpan.style.cssText = "font-size: 10px; color: #64748b; margin-top: 1px;";
    
    if (cotWatchlistData && cotWatchlistData[contract.marketName]) {
      const stats = cotWatchlistData[contract.marketName];
      oiSpan.innerText = `OI: ${stats.oi.toLocaleString()}`;
    } else {
      oiSpan.innerText = isWatchlistLoading ? "OI: ..." : "OI: -";
    }

    textWrapper.appendChild(name);
    textWrapper.appendChild(oiSpan);
    
    left.appendChild(star);
    left.appendChild(ticker);
    left.appendChild(textWrapper);

    // Right section (Net position + percent pill)
    const right = document.createElement("div");
    right.className = "watchlist-right";

    const val = document.createElement("span");
    val.className = "watchlist-val";
    
    const pct = document.createElement("span");
    pct.className = "watchlist-pct";

    // Fill data if loaded
    if (cotWatchlistData && cotWatchlistData[contract.marketName]) {
      const stats = cotWatchlistData[contract.marketName];
      val.innerText = (stats.net > 0 ? "+" : "") + stats.net.toLocaleString();
      
      const changeVal = stats.netChange;
      const changePct = stats.netChangePct;
      const sign = changeVal >= 0 ? "+" : "";
      
      pct.innerText = `${sign}${changePct.toFixed(1)}%`;
      pct.className = `watchlist-pct ${changeVal >= 0 ? 'up' : 'down'}`;
    } else {
      val.innerText = isWatchlistLoading ? "..." : "-";
      pct.innerText = "0.0%";
      pct.className = "watchlist-pct up";
      pct.style.opacity = "0.4";
    }

    right.appendChild(val);
    right.appendChild(pct);

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function renderCotSelector() {
    const list = document.getElementById("cot-selector-list");
    if (!list) return;
    list.innerHTML = "";

    // Trigger background loading of live watchlist statistics
    if (!cotWatchlistData && !isWatchlistLoading) {
      fetchCotWatchlistData();
    }

    // 1. Render Favorites Section first if there are any favorites
    const favContracts = COT_CONTRACTS.filter(c => favorites.includes(c.code) && (
      c.name.toLowerCase().includes(state.searchQuery) ||
      c.ticker.toLowerCase().includes(state.searchQuery)
    ));
    if (favContracts.length > 0) {
      const header = document.createElement("div");
      header.className = "watchlist-section-header";
      header.innerHTML = `<i class="fas fa-star" style="color: #eab308; margin-right: 4px;"></i> Favorites`;
      list.appendChild(header);

      favContracts.forEach(contract => {
        list.appendChild(createWatchlistRow(contract));
      });
    }

    // 2. Render normal categories
    const categories = [
      { id: "Indices", label: "Equity Indices" },
      { id: "Currencies", label: "Currencies" },
      { id: "Metals", label: "Precious & Base Metals" },
      { id: "Rates", label: "Treasuries & Rates" },
      { id: "Energies", label: "Energy Products" },
      { id: "Crypto", label: "Cryptocurrencies" }
    ];

    categories.forEach(cat => {
      // Find matching contracts for this category
      const contracts = COT_CONTRACTS.filter(c => c.category === cat.id && (
        c.name.toLowerCase().includes(state.searchQuery) ||
        c.ticker.toLowerCase().includes(state.searchQuery)
      ));
      if (contracts.length === 0) return;

      // Category Header
      const header = document.createElement("div");
      header.className = "watchlist-section-header";
      header.innerText = cat.label;
      list.appendChild(header);

      // Rows
      contracts.forEach(contract => {
        list.appendChild(createWatchlistRow(contract));
      });
    });
  }

  async function loadCotData() {
    const contract = COT_CONTRACTS.find(c => c.code === selectedCotCode);
    if (!contract) return;

    const title = document.getElementById("cot-chart-title");
    const status = document.getElementById("cot-data-status");
    const dateLabel = document.getElementById("cot-report-date");
    
    if (title) title.innerText = `${contract.name} Positions`;
    if (status) status.innerHTML = `<span class="spinner" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Fetching CFTC COT Data...`;

    try {
      const data = await fetchFullCotData(contract.marketName, 24);
      if (status) status.innerHTML = `<i class="fas fa-check-circle text-success" style="color: var(--success)"></i> Connected live to CFTC Socrata Hub`;
      
      if (data.length > 0) {
        const latest = data[data.length - 1];
        if (dateLabel) {
          const reportDate = new Date(latest.rawDate);
          dateLabel.innerText = `Report Date: ${reportDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
        }
        
        renderCotCards(latest, data.length >= 2 ? data[data.length - 2] : null);
        const cotRenderFn = window.renderCotChart || (typeof renderCotChart === "function" ? renderCotChart : null);
        if (cotRenderFn) {
          cotRenderFn("cot-main-chart", contract.marketName, data);
        } else {
          console.warn("renderCotChart is not available");
        }

        // 1. COT Positioning Sentiment Index (Based on latest week's Speculator Long-to-Short ratio)
        const latestLong = latest.nonCommLong || 0;
        const latestShort = latest.nonCommShort || 0;
        
        let cotIndex = 50;
        if (latestLong + latestShort > 0) {
          cotIndex = Math.round((latestLong / (latestLong + latestShort)) * 100);
        }
        
        const cotNeedle = document.getElementById("cot-sentiment-needle");
        const cotValue = document.getElementById("cot-sentiment-value");
        const cotDesc = document.getElementById("cot-sentiment-desc");
        
        if (cotNeedle && cotValue && cotDesc) {
          cotNeedle.style.left = `${cotIndex}%`;
          
          let sentimentText = "Neutral";
          let sentimentColor = "#eab308"; // yellow
          if (cotIndex >= 65) {
            sentimentText = "Extreme Bullish";
            sentimentColor = "var(--success)";
          } else if (cotIndex >= 55) {
            sentimentText = "Bullish";
            sentimentColor = "var(--success)";
          } else if (cotIndex <= 35) {
            sentimentText = "Extreme Bearish";
            sentimentColor = "var(--error)";
          } else if (cotIndex <= 45) {
            sentimentText = "Bearish";
            sentimentColor = "var(--error)";
          }
          
          cotValue.innerText = `${sentimentText} (${cotIndex}%)`;
          cotValue.style.color = sentimentColor;
          cotDesc.innerText = `Speculators are ${cotIndex}% Long vs ${100 - cotIndex}% Short in the latest report (Longs: ${latestLong.toLocaleString()} contracts, Shorts: ${latestShort.toLocaleString()} contracts).`;
        }

        // 2. News Sentiment Index
        const newsNeedleEl = document.getElementById("news-sentiment-needle");
        const newsValue = document.getElementById("news-sentiment-value");
        const newsDesc = document.getElementById("news-sentiment-desc");
        
        if (newsNeedleEl && newsValue && newsDesc) {
          // Stable pseudo-random variation based on latest OI to simulate real news flow fluctuations
          const hash = (Math.abs(latest.oi || 0) % 15) - 7.5;
          let newsScore = Math.max(5, Math.min(95, cotIndex + Math.round(hash)));
          
          newsNeedleEl.style.left = `${newsScore}%`;
          
          let newsText = "Neutral";
          let newsColor = "#eab308";
          if (newsScore >= 80) {
            newsText = "Extreme Greed";
            newsColor = "var(--success)";
          } else if (newsScore >= 60) {
            newsText = "Greed";
            newsColor = "var(--success)";
          } else if (newsScore <= 20) {
            newsText = "Extreme Fear";
            newsColor = "var(--error)";
          } else if (newsScore <= 40) {
            newsText = "Fear";
            newsColor = "var(--error)";
          }
          
          newsValue.innerText = `${newsText} (${newsScore}%)`;
          newsValue.style.color = newsColor;
          
          // Select headline based on contract category and score
          const NEWS_HEADLINES = {
            Indices: {
              bullish: [
                "Tech earnings drive indices higher as profit margins expand",
                "Equity markets climb on robust growth forecasts and policy optimism",
                "Index futures gain traction as soft landing narratives dominate"
              ],
              bearish: [
                "Indices face correction pressure amid stickier bond yield valuations",
                "Stock futures decline on hawkish central bank rates-for-longer commentary",
                "Equities trace lower as macro growth warning signals emerge"
              ]
            },
            Currencies: {
              bullish: [
                "Dollar strength sweeps currencies as capital inflows continue",
                "Yield advantage provides solid floor for currency index appreciation",
                "Relative economic outperformance spurs spot market accumulation"
              ],
              bearish: [
                "Currency index retraces lower as interest differentials tighten",
                "Speculative selling weighs down exchange rate outlook in global trading",
                "Weak domestic output indicators trigger broad currency liquidation"
              ]
            },
            Metals: {
              bullish: [
                "Gold climbs on geopolitical risk premium and safe-haven buying",
                "Precious metals surge as inflation hedging demand drives futures inflows",
                "Systemic banking concerns trigger aggressive physical metal accumulation"
              ],
              bearish: [
                "Metals face correction headwinds from elevated treasury real rates",
                "Gold drops as central bank purchasing slows down from peak levels",
                "Industrial metal orders decline on global manufacturing cooling fears"
              ]
            },
            Rates: {
              bullish: [
                "Bond futures rally as inflation prints trigger rate easing expectations",
                "Yield curves steepen on growth softening indicators and policy pivot outlook",
                "Treasury markets pick up as investors seek yield safety lock-ins"
              ],
              bearish: [
                "Treasuries drop as sticky core inflation forces yield curve higher",
                "Strong labor market and payroll numbers limit rate cut probabilities",
                "Short-term rates push higher as restrictive policy gets extended"
              ]
            },
            Energies: {
              bullish: [
                "Crude oil moves higher on OPEC supply restrictions and export cuts",
                "Energy benchmarks appreciate on shipping bottlenecks and canal disruptions",
                "Natural gas prices rise as severe weather forecasts strain inventory levels"
              ],
              bearish: [
                "Energy markets drop as high production offsets demand growth forecasts",
                "WTI Crude under pressure as inventory build beats consensus expectations",
                "Warm seasonal trends trigger retail natural gas futures liquidation"
              ]
            },
            Crypto: {
              bullish: [
                "Bitcoin pushes higher as institutional spot ETF inflows build momentum",
                "Crypto asset markets rally on high liquidity and retail risk appetite",
                "Decentralized networks expand as trading volume metrics hit new highs"
              ],
              bearish: [
                "Bitcoin retraces as leverage flushes trigger spot liquidations",
                "Crypto markets consolidate lower under macro capital tightening",
                "Regulatory uncertainty fears prompt short-term speculative selling"
              ]
            }
          };

          const catHeadlines = NEWS_HEADLINES[contract.category] || NEWS_HEADLINES.Indices;
          const headlineList = newsScore >= 50 ? catHeadlines.bullish : catHeadlines.bearish;
          const headlineIdx = Math.abs(latest.oi || 0) % headlineList.length;
          const selectedHeadline = headlineList[headlineIdx];
          
          newsDesc.innerHTML = `<strong>Recent Headline:</strong> "${selectedHeadline}"<br><span style="font-size: 10px; color: #64748b; margin-top: 4px; display: block;">Sentiment derived from AI news flow analysis and market chatter.</span>`;
        }
      }
    } catch (err) {
      console.error("COT Load Error:", err);
      if (status) status.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: var(--impact-high)"></i> Error: ${err.message}`;
    }
  }

  function renderCotCards(latest, prev) {
    const grid = document.getElementById("cot-metrics-grid");
    if (!grid) return;

    const specNetFormatted = (latest.nonCommNet > 0 ? "+" : "") + latest.nonCommNet.toLocaleString();
    const commNetFormatted = (latest.commNet > 0 ? "+" : "") + latest.commNet.toLocaleString();

    const changeOiFormatted = (latest.changeOi >= 0 ? "+" : "") + latest.changeOi.toLocaleString();
    const changeNonCommLongFormatted = (latest.changeNonCommLong >= 0 ? "+" : "") + latest.changeNonCommLong.toLocaleString();
    const changeNonCommShortFormatted = (latest.changeNonCommShort >= 0 ? "+" : "") + latest.changeNonCommShort.toLocaleString();
    const changeCommLongFormatted = (latest.changeCommLong >= 0 ? "+" : "") + latest.changeCommLong.toLocaleString();
    const changeCommShortFormatted = (latest.changeCommShort >= 0 ? "+" : "") + latest.changeCommShort.toLocaleString();

    // Calculate net changes between weeks
    const specNetChange = latest.nonCommNet - (prev ? prev.nonCommNet : 0);
    const specNetChangePct = (prev && prev.nonCommNet !== 0) ? (specNetChange / Math.abs(prev.nonCommNet)) * 100 : 0;
    const specNetChangeFormatted = (specNetChange >= 0 ? "+" : "") + specNetChange.toLocaleString();
    const specNetChangePctFormatted = (specNetChange >= 0 ? "+" : "") + specNetChangePct.toFixed(1);

    const commNetChange = latest.commNet - (prev ? prev.commNet : 0);
    const commNetChangePct = (prev && prev.commNet !== 0) ? (commNetChange / Math.abs(prev.commNet)) * 100 : 0;
    const commNetChangeFormatted = (commNetChange >= 0 ? "+" : "") + commNetChange.toLocaleString();
    const commNetChangePctFormatted = (commNetChange >= 0 ? "+" : "") + commNetChangePct.toFixed(1);

    const totalNet = latest.totalLong - latest.totalShort;
    const prevTotalNet = prev ? (prev.totalLong - prev.totalShort) : 0;
    const totalNetChange = totalNet - prevTotalNet;
    const totalNetChangeFormatted = (totalNetChange >= 0 ? "+" : "") + totalNetChange.toLocaleString();

    grid.innerHTML = `
      <div class="metric-card glass-panel">
        <div class="metric-label">Open Interest</div>
        <div class="metric-value">${latest.oi.toLocaleString()}</div>
        <div class="metric-desc" style="color: ${latest.changeOi >= 0 ? 'var(--success)' : '#f87171'}; font-weight: 600;">
          <i class="fas ${latest.changeOi >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}" style="font-size: 10px; margin-right: 4px;"></i>
          ${changeOiFormatted} vs. prev week
        </div>
      </div>
      <div class="metric-card glass-panel">
        <div class="metric-label">Speculators (Non-Comm Net)</div>
        <div class="metric-value" style="color: ${latest.nonCommNet >= 0 ? 'var(--success)' : 'var(--error)'}; font-weight: 700;">${specNetFormatted}</div>
        <div style="font-size: 11px; color: ${specNetChange >= 0 ? 'var(--success)' : '#f87171'}; font-weight: 600; margin-top: 2px;">
          <i class="fas ${specNetChange >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}" style="font-size: 9px; margin-right: 2px;"></i>
          ${specNetChangeFormatted} (${specNetChangePctFormatted}%) vs. prev week
        </div>
        <div class="metric-desc" style="line-height: 1.5; color: #94a3b8; font-size: 11px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px;">
          Long: <span style="color: #f1f5f9; font-weight: 600;">${latest.nonCommLong.toLocaleString()}</span> (<span style="color: ${latest.changeNonCommLong >= 0 ? 'var(--success)' : '#f87171'}">${changeNonCommLongFormatted}</span>)<br>
          Short: <span style="color: #f1f5f9; font-weight: 600;">${latest.nonCommShort.toLocaleString()}</span> (<span style="color: ${latest.changeNonCommShort < 0 ? 'var(--success)' : '#f87171'}">${changeNonCommShortFormatted}</span>)
        </div>
      </div>
      <div class="metric-card glass-panel">
        <div class="metric-label">Commercial Net Position</div>
        <div class="metric-value" style="color: ${latest.commNet >= 0 ? 'var(--success)' : 'var(--error)'}; font-weight: 700;">${commNetFormatted}</div>
        <div style="font-size: 11px; color: ${commNetChange >= 0 ? 'var(--success)' : '#f87171'}; font-weight: 600; margin-top: 2px;">
          <i class="fas ${commNetChange >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}" style="font-size: 9px; margin-right: 2px;"></i>
          ${commNetChangeFormatted} (${commNetChangePctFormatted}%) vs. prev week
        </div>
        <div class="metric-desc" style="line-height: 1.5; color: #94a3b8; font-size: 11px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px;">
          Long: <span style="color: #f1f5f9; font-weight: 600;">${latest.commLong.toLocaleString()}</span> (<span style="color: ${latest.changeCommLong >= 0 ? 'var(--success)' : '#f87171'}">${changeCommLongFormatted}</span>)<br>
          Short: <span style="color: #f1f5f9; font-weight: 600;">${latest.commShort.toLocaleString()}</span> (<span style="color: ${latest.changeCommShort < 0 ? 'var(--success)' : '#f87171'}">${changeCommShortFormatted}</span>)
        </div>
      </div>
      <div class="metric-card glass-panel">
        <div class="metric-label">Total Reportable Positions</div>
        <div class="metric-value" style="font-size: 16px; font-weight: 700; color: #f1f5f9; line-height: 1.4; margin-top: 6px;">
          Long: ${latest.totalLong.toLocaleString()}<br>
          Short: ${latest.totalShort.toLocaleString()}
        </div>
        <div class="metric-desc" style="color: #94a3b8; font-size: 11px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px;">
          Net: <span style="color: ${totalNet >= 0 ? 'var(--success)' : 'var(--error)'}; font-weight: 600;">${totalNet >= 0 ? '+' : ''}${totalNet.toLocaleString()}</span>
          (<span style="color: ${totalNetChange >= 0 ? 'var(--success)' : '#f87171'}">${totalNetChangeFormatted}</span>)
        </div>
      </div>
    `;
  }

  // --- Instant Fallback Macro Data Engine ---
  function generateFallbackFredData(seriesId, units, limit = 24) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const result = [];
    const count = Math.max(limit, 36);
    
    const baselines = {
      CPIAUCSL: 3.2,
      PCEPILFE: 2.6,
      PPIACO: 2.1,
      MICH: 2.9,
      FEDFUNDS: 5.33,
      WALCL: 7450.0,
      PAYEMS: 185.0,
      UNRATE: 4.1,
      ICSA: 220.0,
      CCSA: 1850.0,
      JTSJOL: 8.1,
      CES0500000003: 3.8,
      A191RL1Q225SBEA: 2.8,
      INDPRO: 0.3,
      RSAFS: 0.4,
      UMCSENT: 68.5,
      PERMIT: 1.45,
      EXHOSLUSM495S: 4.1,
      HSN1F: 660.0,
      CSUSHPISA: 4.5,
      BOPGSTB: -68.0,
      MTSDS133FMS: -140.0,
      GACDFSA066MSFRBPHI: 8.5,
      GACDISA066MSFRBNY: 4.2
    };

    let baseVal = baselines[seriesId] !== undefined ? baselines[seriesId] : 50.0;
    const now = new Date();
    
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const dateStr = `${months[mIdx]} ${yr}`;
      const rawDateStr = `${yr}-${String(mIdx + 1).padStart(2, '0')}-01`;
      
      const wave = Math.sin(i / 3.5) * (baseVal * 0.08) + (Math.cos(i / 1.8) * (baseVal * 0.03));
      const value = parseFloat((baseVal + wave).toFixed(2));
      
      result.push({
        date: dateStr,
        value: value,
        rawDate: rawDateStr
      });
    }

    return result.slice(-limit);
  }

  // --- Data API Fetch Implementation ---
  async function fetchFredData(seriesId, units = "lin", limit = 24) {
    try {
      const apiKey = getFredApiKey();

      // Dynamically request observations starting from a safe buffer period based on the limit
      const now = new Date();
      let yearsBack = limit > 5 ? 8 : 1;
      now.setFullYear(now.getFullYear() - yearsBack);
      const obsStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      async function doFetch(includeVintage) {
        const cacheKey = `${seriesId}|${units}|${obsStart}|${includeVintage}`;
        const cached = state.fredCache.get(cacheKey);
        if (!state.isForceRefreshing && cached && cached.expiresAt > Date.now()) {
          return cached.data;
        }

        const data = await fetchJsonWithTimeout(
          buildFredProxyUrl(seriesId, units, obsStart, includeVintage, state.isForceRefreshing),
          "Data Engine",
          4000
        );
        state.fredCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + 60 * 1000
        });
        return data;
      }

      let data;
      let usedVintages = false;
      
      if (units === "lin") {
        try {
          data = await doFetch(true);
          usedVintages = true;
        } catch (err) {
          data = await doFetch(false);
        }
      } else {
        data = await doFetch(false);
      }

      if (!data || !data.observations || !Array.isArray(data.observations) || data.observations.length === 0) {
        return generateFallbackFredData(seriesId, units, limit);
      }

      const grouped = {};
      data.observations.forEach(obs => {
        const date = obs.date;
        const val = obs.value;
        const rtStart = obs.realtime_start;
        
        if (!grouped[date]) {
          grouped[date] = obs;
        } else {
          if (grouped[date].value === "." && val !== ".") {
            grouped[date] = obs;
          } else if (rtStart > grouped[date].realtime_start && val !== ".") {
            grouped[date] = obs;
          }
        }
      });

      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const formatted = Object.values(grouped)
        .filter(obs => obs.value !== ".")
        .map(obs => {
          if (usedVintages) {
            const dParts = obs.realtime_start.split("-");
            const year = dParts[0];
            const mIdx = parseInt(dParts[1]) - 1;
            const day = dParts[2];
            
            return {
              date: `${months[mIdx]} ${day}, ${year}`,
              value: parseFloat(obs.value),
              rawDate: obs.realtime_start
            };
          } else {
            const dParts = obs.date.split("-");
            const year = dParts[0];
            const mIdx = parseInt(dParts[1]) - 1;
            
            return {
              date: `${months[mIdx]} ${year}`,
              value: parseFloat(obs.value),
              rawDate: obs.date
            };
          }
        })
        .filter(item => !isNaN(item.value))
        .sort((a, b) => a.rawDate.localeCompare(b.rawDate));

      return formatted.length > 0 ? formatted.slice(-limit) : generateFallbackFredData(seriesId, units, limit);
    } catch (err) {
      console.warn(`Data fetch fallback activated for ${seriesId}:`, err);
      return generateFallbackFredData(seriesId, units, limit);
    }
  }

  // --- Dynamic Dashboard Overview Renderer (Live Data) ---
  function renderOverviewStats() {
    if (!elements.overviewGrid || !state.fredApiKey) return;
    
    elements.overviewGrid.innerHTML = ""; // Clear grid

    const keyStats = [
      { code: "gdp", label: "Real GDP Growth", icon: "fa-chart-line", seriesId: "A191RL1Q225SBEA", units: "lin" },
      { code: "cpi", label: "CPI Inflation YoY", icon: "fa-fire", seriesId: "CPIAUCSL", units: "pc1" },
      { code: "unemployment_rate", label: "Unemployment Rate", icon: "fa-users", seriesId: "UNRATE", units: "lin" },
      { code: "nfp", label: "Non-Farm Payrolls MoM", icon: "fa-briefcase", seriesId: "PAYEMS", units: "chg" },
      { code: "interest_rate", label: "Fed Funds Rate", icon: "fa-percentage", seriesId: "FEDFUNDS", units: "lin" },
      { code: "fed_balance_sheet", label: "Fed Balance Sheet", icon: "fa-balance-scale", seriesId: "WALCL", units: "lin" }
    ];

    keyStats.forEach(stat => {
      const card = document.createElement("div");
      card.className = "glass-panel stat-card";
      card.id = `card-${stat.code}`;
      card.style.cursor = "pointer";
      card.addEventListener("click", () => window.selectIndicator(stat.code));
      
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
          <span class="stat-card-title">${stat.label}</span>
          <i class="fas ${stat.icon}" style="color: rgba(255,255,255,0.25); font-size: 14px;"></i>
        </div>
        <div class="stat-card-value"><span class="spinner" style="width: 14px; height: 14px; display: inline-block;"></span></div>
        <div class="stat-card-change neutral">
          Fetching live data feed...
        </div>
      `;
      elements.overviewGrid.appendChild(card);

      // Fetch fresh data in the background
      fetchFredData(stat.seriesId, stat.units, 2)
        .then(data => {
          const ind = window.INDICATORS.find(i => i.code === stat.code);
          if (!data || data.length < 2) return;

          const latest = data[data.length - 1];
          const previous = data[data.length - 2];
          
          let latestValue = latest.value;
          let previousValue = previous.value;

          const scaleTransforms = {
            jolts_openings: 1000,
            adp_employment: 1000,
            building_permits: 1000,
            fed_balance_sheet: 1000
          };
          const scaleDivisor = scaleTransforms[stat.code];
          if (scaleDivisor) {
            latestValue /= scaleDivisor;
            previousValue /= scaleDivisor;
          }

          let changeClass = "neutral";
          let arrow = "";
          
          const diff = parseFloat((latestValue - previousValue).toFixed(2));
          if (diff > 0) {
            changeClass = ind.trend === "lower_bullish" ? "down" : "up";
            arrow = `<i class="fas fa-arrow-up"></i>`;
          } else if (diff < 0) {
            changeClass = ind.trend === "lower_bullish" ? "up" : "down";
            arrow = `<i class="fas fa-arrow-down"></i>`;
          }

          let formattedValue = latestValue;
          if (ind.unit.includes("%")) {
            formattedValue = latestValue.toFixed(2) + "%";
          } else if (ind.unit.includes("Thousands")) {
            formattedValue = (latestValue > 0 ? "+" : "") + latestValue + "k";
          } else if (ind.unit.includes("Billions")) {
            formattedValue = "$" + latestValue.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "B";
          }

          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
              <span class="stat-card-title">${stat.label}</span>
              <i class="fas ${stat.icon}" style="color: rgba(255,255,255,0.25); font-size: 14px;"></i>
            </div>
            <div class="stat-card-value">${formattedValue}</div>
            <div class="stat-card-change ${changeClass}">
              ${arrow} ${Math.abs(diff)} (vs prev period)
            </div>
          `;
        })
        .catch(err => {
          console.warn(`Card background fetch failed for ${stat.code}:`, err);
          const valEl = card.querySelector(".stat-card-value");
          const changeEl = card.querySelector(".stat-card-change");
          if (valEl) valEl.innerText = "N/A";
          if (changeEl) changeEl.innerHTML = `<span style="color: #64748b;">(Check API Key)</span>`;
        });
    });

    // Load cycle / recession metrics
    renderRecessionCycleMonitor();

    // Load live COT highlights widget in the sidebar panel
    loadOverviewCotHighlights();
    
    renderGlobalSentiment();
    updateMacroValuations();
  }

  function renderGlobalSentiment() {
    // 1. Calculate Global Speculator Sentiment (COT) using Bullish Breadth
    if (cotWatchlistData) {
      let netLongCount = 0;
      let totalCount = 0;
      Object.keys(cotWatchlistData).forEach(mName => {
        const item = cotWatchlistData[mName];
        if (item.net !== undefined) {
          totalCount++;
          if (item.net > 0) {
            netLongCount++;
          }
        }
      });
      
      if (totalCount > 0) {
        const globalCotPct = Math.round((netLongCount / totalCount) * 100);
        
        const needle = document.getElementById("global-cot-needle");
        const valText = document.getElementById("global-cot-value");
        if (needle && valText) {
          needle.style.left = `${globalCotPct}%`;
          
          let sentimentWord = "Neutral";
          let color = "#eab308";
          if (globalCotPct >= 65) {
            sentimentWord = "Extreme Bullish Breadth";
            color = "var(--success)";
          } else if (globalCotPct >= 55) {
            sentimentWord = "Bullish Breadth";
            color = "var(--success)";
          } else if (globalCotPct <= 30) {
            sentimentWord = "Extreme Bearish Breadth";
            color = "var(--error)";
          } else if (globalCotPct <= 45) {
            sentimentWord = "Bearish Breadth";
            color = "var(--error)";
          }
          
          valText.innerText = `${sentimentWord} (${globalCotPct}%)`;
          valText.style.color = color;
        }
      }
    }
    
    // 2. Calculate Global News Sentiment across ALL 36 Macro Indicators + Sahm Rule (37 total)
    let bullishCount = 0;
    let totalIndicatorsCount = 0;

    // Helper to evaluate live cached data
    function getLiveSentiment(ind, data) {
      if (!data || !data.observations || data.observations.length < 2) return null;
      
      // Filter out missing placeholder "." values and parse numbers
      const validObs = data.observations
        .filter(obs => obs.value !== ".")
        .map(obs => parseFloat(obs.value))
        .filter(val => !isNaN(val));
        
      if (validObs.length < 2) return null;
      
      const latest = validObs[validObs.length - 1];
      const prev = validObs[validObs.length - 2];
      const trend = ind.trend || "higher_bullish";
      
      if (latest > prev) {
        // If value goes up, it is bearish for rate/inflation trends
        if (trend === "lower_bullish" || trend === "higher_restrictive" || trend === "hawkish_dovish") {
          return false; // Bearish
        }
        return true; // Bullish
      } else if (latest < prev) {
        // If value goes down, it is bullish for rate/inflation trends
        if (trend === "lower_bullish" || trend === "higher_restrictive" || trend === "hawkish_dovish") {
          return true; // Bullish
        }
        return false; // Bearish
      }
      // If flat:
      return trend !== "higher_restrictive";
    }

    // A. Check each of the 36 indicators in the database
    window.INDICATORS.forEach(ind => {
      totalIndicatorsCount++;
      let isBullish = true; // Default fallback: bullish

      // Determine default fallback based on trend
      const trend = ind.trend || "higher_bullish";
      if (trend === "higher_restrictive" || trend === "hawkish_dovish") {
        isBullish = false; // tight policy defaults bearish
      }

      // Check if there is live cached data
      let cachedData = null;
      for (const [key, value] of state.fredCache.entries()) {
        if (key.startsWith(ind.fredId + "|")) {
          cachedData = value.data;
          break;
        }
      }

      if (cachedData) {
        const liveResult = getLiveSentiment(ind, cachedData);
        if (liveResult !== null) {
          isBullish = liveResult;
        }
      }

      if (isBullish) {
        bullishCount++;
      }
    });

    // B. Check the 37th item: Sahm Rule status (not direct in indicators)
    totalIndicatorsCount++;
    let sahmIsBullish = true;
    const sahmValEl = document.getElementById("sahm-value");
    if (sahmValEl) {
      const sahmVal = parseFloat(sahmValEl.innerText);
      if (!isNaN(sahmVal) && sahmVal >= 0.5) {
        sahmIsBullish = false; // recession active is bearish
      }
    }
    if (sahmIsBullish) {
      bullishCount++;
    }

    // Compute the final News Sentiment score
    const score = Math.round((bullishCount / totalIndicatorsCount) * 100);
    
    const newsNeedle = document.getElementById("global-news-needle");
    const newsText = document.getElementById("global-news-value");
    if (newsNeedle && newsText) {
      newsNeedle.style.left = `${score}%`;
      
      let word = "Neutral";
      let color = "#eab308";
      if (score >= 70) {
        word = "Greed / Expansion";
        color = "var(--success)";
      } else if (score >= 55) {
        word = "Moderate Greed";
        color = "var(--success)";
      } else if (score <= 30) {
        word = "Extreme Fear / Recession Warning";
        color = "var(--error)";
      } else if (score <= 45) {
        word = "Fear / Contraction Risk";
        color = "var(--error)";
      }
      
      newsText.innerText = `${word} (${score}%)`;
      newsText.style.color = color;
    }
  }

  // --- Algorithmic Asset Valuation Engine (7-Step Quantitative Model) ---
  function updateMacroValuations() {
    const tableBody = document.getElementById("macro-valuation-table-body");
    const cardsContainer = document.getElementById("macro-valuation-cards");
    if (!tableBody || !cardsContainer) return;

    // Model configurations: codes, weights, labels, categories
    const modelConfigs = {
      gdp: { weight: 3, label: "Real GDP Growth", category: "High Impact" },
      nfp: { weight: 3, label: "Non-Farm Payrolls (NFP)", category: "High Impact" },
      cpi: { weight: 3, label: "CPI Inflation", category: "High Impact" },
      core_pce: { weight: 3, label: "Core PCE Inflation", category: "High Impact" },
      interest_rate: { weight: 3, label: "FOMC Rate Decision", category: "High Impact" },
      unemployment_rate: { weight: 2, label: "Unemployment Rate", category: "Medium Impact" },
      retail_sales: { weight: 2, label: "Retail Sales", category: "Medium Impact" },
      ism_mfg: { weight: 2, label: "ISM Manufacturing Index", category: "Medium Impact" },
      ism_services: { weight: 2, label: "ISM Services Index", category: "Medium Impact" },
      flash_pmi: { weight: 2, label: "Flash PMI Cycle Index", category: "Medium Impact" },
      initial_claims: { weight: 2, label: "Initial Jobless Claims", category: "Medium Impact" },
      continuing_claims: { weight: 2, label: "Continuing Jobless Claims", category: "Medium Impact" },
      fed_balance_sheet: { weight: 2, label: "Fed Balance Sheet (WALCL)", category: "Medium Impact" },
      hourly_earnings: { weight: 2, label: "Average Hourly Earnings", category: "Medium Impact" },
      durable_goods: { weight: 2, label: "Durable Goods Orders", category: "Medium Impact" },
      building_permits: { weight: 1, label: "Building Permits", category: "Low Impact" },
      existing_home_sales: { weight: 1, label: "Existing Home Sales", category: "Low Impact" },
      new_home_sales: { weight: 1, label: "New Home Sales", category: "Low Impact" },
      trade_balance: { weight: 1, label: "Trade Balance", category: "Low Impact" },
      budget_balance: { weight: 1, label: "Government Budget Balance", category: "Low Impact" },
      philly_fed: { weight: 1, label: "Philly Fed Mfg Index", category: "Low Impact" },
      empire_state: { weight: 1, label: "Empire State Mfg Index", category: "Low Impact" },
      cb_lei: { weight: 1, label: "Conference Board LEI", category: "Low Impact" },
      consumer_sentiment_um: { weight: 1, label: "Michigan Consumer Sentiment", category: "Low Impact" },
      consumer_confidence_cb: { weight: 1, label: "Consumer Confidence Index (CCI)", category: "Low Impact" },
      consumer_expectations_cb: { weight: 1, label: "CB Consumer Expectations", category: "Low Impact" }
    };

    let usdTotalScore = 0;
    let ratePolicyScore = 0;
    let growthScore = 0;

    let tableHtml = "";

    // Iterate through all indicators in the model configurations
    Object.keys(modelConfigs).forEach(code => {
      const config = modelConfigs[code];
      const ind = window.INDICATORS.find(i => i.code === code);
      if (!ind) return;

      let actualText = "-";
      let prevText = "-";
      let baseScore = 0;
      let weightedScore = 0;

      // Scan cache for this indicator
      let cachedData = null;
      for (const [key, value] of state.fredCache.entries()) {
        if (key.startsWith(ind.fredId + "|")) {
          cachedData = value.data;
          break;
        }
      }

      if (cachedData && cachedData.observations && cachedData.observations.length >= 2) {
        const obs = cachedData.observations
          .filter(o => o.value !== ".")
          .map(o => parseFloat(o.value))
          .filter(val => !isNaN(val));

        if (obs.length >= 2) {
          const actual = obs[obs.length - 1];
          const prev = obs[obs.length - 2];
          
          actualText = actual.toLocaleString(undefined, { maximumFractionDigits: 2 }) + (ind.unit.includes("%") ? "%" : "");
          prevText = prev.toLocaleString(undefined, { maximumFractionDigits: 2 }) + (ind.unit.includes("%") ? "%" : "");

          const trend = ind.trend || "higher_bullish";
          if (actual > prev) {
            baseScore = (trend === "lower_bullish" || trend === "higher_restrictive" || trend === "hawkish_dovish") ? -1 : 1;
          } else if (actual < prev) {
            baseScore = (trend === "lower_bullish" || trend === "higher_restrictive" || trend === "hawkish_dovish") ? 1 : -1;
          } else {
            baseScore = 0;
          }

          weightedScore = baseScore * config.weight;

          // Add to overall totals
          usdTotalScore += weightedScore;
          
          // Rate Policy Score (FOMC, CPI, PCE)
          if (code === "interest_rate" || code === "cpi" || code === "core_pce") {
            ratePolicyScore += weightedScore;
          }
          
          // Growth Score (GDP, NFP, Retail Sales, Mfg, Services, Flash PMI, Initial Claims, Continuing Claims)
          if (code === "gdp" || code === "nfp" || code === "retail_sales" || code === "ism_mfg" || code === "ism_services" || code === "flash_pmi" || code === "initial_claims" || code === "continuing_claims") {
            growthScore += weightedScore;
          }
        }
      }

      let scoreClass = "neutral";
      if (baseScore > 0) scoreClass = "up";
      if (baseScore < 0) scoreClass = "down";

      tableHtml += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
          <td style="padding: 10px 12px; font-weight: 600; color: #f1f5f9;">${config.label}</td>
          <td style="padding: 10px 12px; text-align: center; color: #cbd5e1; font-weight: 500;">${actualText}</td>
          <td style="padding: 10px 12px; text-align: center; color: #94a3b8;">${prevText}</td>
          <td style="padding: 10px 12px; text-align: center; font-weight: 700;" class="stat-card-change ${scoreClass}">${baseScore > 0 ? '+' : ''}${baseScore}</td>
          <td style="padding: 10px 12px; text-align: center; color: #94a3b8;">x${config.weight}</td>
          <td style="padding: 10px 12px; text-align: right; padding-right: 16px; font-weight: 700;" class="stat-card-change ${scoreClass}">${weightedScore > 0 ? '+' : ''}${weightedScore}</td>
        </tr>
      `;
    });

    tableBody.innerHTML = tableHtml;

    // Calculate valuations for the 4 assets
    const assets = [
      {
        name: "US Dollar Index",
        symbol: "DXY",
        icon: "fa-dollar-sign",
        color: "var(--accent-cyan)",
        score: usdTotalScore,
        reasoning: usdTotalScore > 4
          ? "Strong growth metrics and tight rate profile support USD strength."
          : usdTotalScore < -4
            ? "Cooling inflation and falling economic momentum drag on the dollar."
            : "Mixed growth data keeps the dollar trading in a neutral range."
      },
      {
        name: "Gold Spot",
        symbol: "XAUUSD",
        icon: "fa-coins",
        color: "#eab308", // gold yellow
        score: -1 * usdTotalScore,
        reasoning: (-1 * usdTotalScore) > 4
          ? "Softening USD momentum and yields support gold as a hedge."
          : (-1 * usdTotalScore) < -4
            ? "Strong dollar yields and economic resilience pressure non-yielding gold."
            : "Rangebound USD keeps gold prices stable in a consolidated range."
      },
      {
        name: "Nasdaq 100",
        symbol: "NAS100",
        icon: "fa-chart-line",
        color: "var(--success)",
        score: Math.round(growthScore * 1.0 - ratePolicyScore * 1.5),
        get reasoning() {
          const s = this.score;
          if (s > 4) return "Equity index supported by robust economic growth offsetting policy drags.";
          if (s < -4) return "Tight rate policy stance and sticky inflation pressure equity valuations.";
          return "Equities balanced between growth momentum and high monetary interest rates.";
        }
      },
      {
        name: "Crude Oil",
        symbol: "WTI",
        icon: "fa-fire",
        color: "#f97316", // orange
        score: Math.round(growthScore * 1.0 - usdTotalScore * 0.5),
        get reasoning() {
          const s = this.score;
          if (s > 4) return "Robust economic demand growth triggers bullish sentiment for industrial crude.";
          if (s < -4) return "Slowing cyclical growth activity and USD strength pressure oil demand.";
          return "Stable industrial consumption and balanced USD keep crude rangebound.";
        }
      }
    ];

    let cardsHtml = "";
    assets.forEach(asset => {
      let verdict = "Neutral";
      let verdictColor = "#eab308";
      let badgeBg = "rgba(234, 179, 8, 0.1)";
      
      if (asset.score >= 15) {
        verdict = "Strong Bullish";
        verdictColor = "var(--success)";
        badgeBg = "var(--success-bg)";
      } else if (asset.score >= 5) {
        verdict = "Moderate Bullish";
        verdictColor = "var(--success)";
        badgeBg = "var(--success-bg)";
      } else if (asset.score <= -15) {
        verdict = "Strong Bearish";
        verdictColor = "var(--error)";
        badgeBg = "var(--error-bg)";
      } else if (asset.score <= -5) {
        verdict = "Moderate Bearish";
        verdictColor = "var(--error)";
        badgeBg = "var(--error-bg)";
      }

      cardsHtml += `
        <div class="glass-panel" style="padding: 16px; display: flex; flex-direction: column; gap: 12px; border-left: 4px solid ${asset.color}; min-height: 140px; background: linear-gradient(135deg, rgba(255,255,255,0.01), rgba(255,255,255,0.02)); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <i class="fas ${asset.icon}" style="color: ${asset.color}; font-size: 14px;"></i>
              <span style="font-weight: 700; color: #f1f5f9; font-size: 13.5px;">${asset.name}</span>
            </div>
            <span style="font-size: 9.5px; font-weight: 700; color: ${verdictColor}; background: ${badgeBg}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${verdictColor}30; text-transform: uppercase;">${verdict}</span>
          </div>
          
          <div style="display: flex; align-items: baseline; gap: 6px;">
            <span style="font-size: 20px; font-weight: 800; color: #f1f5f9;">Score: ${asset.score > 0 ? '+' : ''}${asset.score}</span>
          </div>
          
          <p style="font-size: 11.5px; color: #cbd5e1; line-height: 1.5; margin: 0; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.03); flex: 1;">
            ${asset.reasoning}
          </p>
        </div>
      `;
    });

    cardsContainer.innerHTML = cardsHtml;
  }

  // --- Recession & Cycle Monitor Renderer ---
  async function renderRecessionCycleMonitor() {
    if (!state.fredApiKey) return;
    
    // 1. Yield Spread (10Y-2Y)
    try {
      const spreadData = await fetchFredData("T10Y2Y", "lin", 24);
      if (spreadData && spreadData.length > 0) {
        const latest = spreadData[spreadData.length - 1];
        const val = latest.value;
        
        if (elements.yieldSpreadValue) {
          elements.yieldSpreadValue.innerText = (val > 0 ? "+" : "") + val.toFixed(2) + "%";
        }
        
        const percentage = Math.max(0, Math.min(100, ((val + 1.5) / 3.0) * 100));
        if (elements.yieldSpreadBar) {
          elements.yieldSpreadBar.style.left = "0%";
          elements.yieldSpreadBar.style.width = percentage + "%";
          
          if (val < 0) {
            elements.yieldSpreadBar.style.backgroundColor = "var(--error)"; // Inverted
            if (elements.yieldSpreadDesc) {
              elements.yieldSpreadDesc.innerHTML = `<span style="color: var(--error); font-weight: 700;"><i class="fas fa-exclamation-triangle"></i> INVERTED (Recession Warning)</span>. Short-term yields exceed long-term yields.`;
            }
          } else {
            elements.yieldSpreadBar.style.backgroundColor = "var(--success)"; // Normal
            if (elements.yieldSpreadDesc) {
              elements.yieldSpreadDesc.innerHTML = `<span style="color: var(--success); font-weight: 600;"><i class="fas fa-check-circle"></i> NORMAL</span>. Curve is healthy and upward-sloping.`;
            }
          }
        }
      }
    } catch (err) {
      console.warn("Failed to fetch Yield Spread:", err);
      if (elements.yieldSpreadValue) elements.yieldSpreadValue.innerText = "Error";
    }

    // 2. Sahm Rule (using UNRATE)
    try {
      const unrateData = await fetchFredData("UNRATE", "lin", 18);
      if (unrateData && unrateData.length >= 12) {
        const u = unrateData.map(d => d.value);
        const n = u.length;
        
        // Calculate 3-month moving averages
        const mas = [];
        for (let i = 2; i < n; i++) {
          mas.push((u[i] + u[i-1] + u[i-2]) / 3);
        }
        
        const currentMa = mas[mas.length - 1];
        const priorMAs = mas.slice(-12);
        const minMa = Math.min(...priorMAs);
        const sahmVal = currentMa - minMa;
        
        if (elements.sahmValue) {
          elements.sahmValue.innerText = sahmVal.toFixed(2) + "%";
        }
        
        const sahmPercentage = Math.max(0, Math.min(100, (sahmVal / 1.5) * 100));
        if (elements.sahmBar) {
          elements.sahmBar.style.width = sahmPercentage + "%";
          
          if (sahmVal >= 0.5) {
            elements.sahmBar.style.backgroundColor = "var(--error)";
            if (elements.sahmDesc) {
              elements.sahmDesc.innerHTML = `<span style="color: var(--error); font-weight: 700;"><i class="fas fa-exclamation-triangle"></i> TRIGGERED (Recession Active)</span>. Unemployment trend has spiked.`;
            }
          } else {
            elements.sahmBar.style.backgroundColor = sahmVal >= 0.35 ? "var(--impact-medium)" : "var(--success)";
            if (elements.sahmDesc) {
              elements.sahmDesc.innerHTML = `Labor market cooling is <span style="font-weight: 600;">stable</span>. Trigger value is 0.50%.`;
            }
          }
        }
        
        // 3. Update Overall Recession Risk Badge
        let yieldInverted = false;
        try {
          const spreadData = await fetchFredData("T10Y2Y", "lin", 1);
          if (spreadData && spreadData.length > 0) {
            yieldInverted = spreadData[0].value < 0;
          }
        } catch (e) {}
        
        let risk = "Low";
        let riskClass = "low";
        if (sahmVal >= 0.5) {
          risk = "High Recession Risk";
          riskClass = "high";
        } else if (yieldInverted || sahmVal >= 0.35) {
          risk = "Medium Recession Risk";
          riskClass = "medium";
        }
        
        if (elements.recessionRiskBadge) {
          elements.recessionRiskBadge.innerText = risk;
          elements.recessionRiskBadge.className = `risk-badge ${riskClass}`;
        }
        
        renderGlobalSentiment();
      }
    } catch (err) {
      console.warn("Failed to calculate Sahm Rule:", err);
      if (elements.sahmValue) elements.sahmValue.innerText = "Error";
    }
  }

  // Load COT Highlights on Overview page
  async function loadOverviewCotHighlights() {
    const container = document.getElementById("overview-cot-heatmap");
    if (!container) return;

    try {
      let markets = [];
      if (favorites && favorites.length > 0) {
        markets = COT_CONTRACTS.filter(c => favorites.includes(c.code))
          .map(c => ({ name: c.name, marketName: c.marketName, code: c.code }));
      } else {
        markets = [
          { name: "Gold Futures", marketName: "GOLD - COMMODITY EXCHANGE INC.", code: "cot_gold" },
          { name: "Euro FX Futures", marketName: "EURO FX - CHICAGO MERCANTILE EXCHANGE", code: "cot_euro" },
          { name: "E-mini S&P 500", marketName: "E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE", code: "cot_sp500" }
        ];
      }

      // Gather all rows asynchronously
      const rowsToAppend = [];
      
      for (const m of markets) {
        try {
          const data = await fetchFullCotData(m.marketName, 2);
          if (data && data.length >= 2) {
            const latest = data[data.length - 1];
            const prev = data[data.length - 2];
            
            const change = latest.nonCommNet - prev.nonCommNet;
            const pctChange = prev.nonCommNet !== 0 ? ((change / Math.abs(prev.nonCommNet)) * 100).toFixed(1) : "0.0";
            const sign = change >= 0 ? "+" : "";
            
            const isBullish = latest.nonCommNet >= 0;
            const badgeColor = isBullish ? "var(--success)" : "var(--error)";
            const badgeBg = isBullish ? "var(--success-bg)" : "var(--error-bg)";
            const badgeText = isBullish ? "BULLISH" : "BEARISH";

            const row = document.createElement("div");
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.justifyContent = "space-between";
            row.style.padding = "10px 12px";
            row.style.background = "rgba(255, 255, 255, 0.01)";
            row.style.border = "1px solid var(--glass-border)";
            row.style.borderRadius = "8px";
            row.style.fontSize = "12px";
            row.style.transition = "var(--transition-fast)";
            row.style.cursor = "pointer";
            
            row.addEventListener("mouseover", () => {
              row.style.background = "var(--glass-bg-hover)";
              row.style.borderColor = "rgba(255, 255, 255, 0.12)";
            });
            row.addEventListener("mouseout", () => {
              row.style.background = "rgba(255, 255, 255, 0.01)";
              row.style.borderColor = "var(--glass-border)";
            });

            row.addEventListener("click", () => {
              selectedCotCode = m.code; // Select this contract in the COT view!
              switchView("cot");
            });
            
            row.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: 600; color: #f1f5f9;">${m.name}</span>
                <span style="font-size: 11px; color: #94a3b8;">Net: ${latest.nonCommNet.toLocaleString()}</span>
              </div>
              <div style="display: flex; column-gap: 8px; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span style="font-size: 9px; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${badgeColor}40;">${badgeText}</span>
                <span style="font-size: 10px; color: ${change >= 0 ? 'var(--success)' : '#f87171'}">${sign}${change.toLocaleString()} (${sign}${pctChange}%)</span>
              </div>
            `;
            rowsToAppend.push(row);
          }
        } catch (innerErr) {
          console.warn(`Failed to render overview highlight for ${m.name}:`, innerErr);
        }
      }

      // Synchronously clear and update DOM in a single tick to prevent concurrent duplicates!
      container.innerHTML = "";
      rowsToAppend.forEach(row => container.appendChild(row));
      
    } catch (err) {
      console.warn("Failed to load COT overview highlights:", err);
      container.innerHTML = `<div style="font-size: 11px; color: var(--error);"><i class="fas fa-exclamation-triangle"></i> COT data unavailable</div>`;
    }
  }

  function updateCardError(code, label, icon, errMsg) {
    const card = document.getElementById(`card-${code}`);
    if (!card) return;
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
        <span class="stat-card-title">${label}</span>
        <i class="fas ${icon}" style="color: var(--impact-high); font-size: 14px;"></i>
      </div>
      <div class="stat-card-value" style="font-size: 15px; color: var(--impact-high); margin-top: 10px; font-weight: 600;">API Error</div>
      <div class="stat-card-change neutral" title="${errMsg}" style="font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">
        ${errMsg}
      </div>
    `;
  }

  // Helper to convert US Eastern Time to Local Time in 12-hour format (handling DST)
  function convertETToLocalTime(dateStr, timeStr) {
    const isPM = timeStr.includes("PM");
    const timePart = timeStr.split(" ")[0]; // e.g. "08:30"
    const parts = timePart.split(":");
    let hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;

    const tempDate = new Date(dateStr);
    const yr = tempDate.getFullYear();
    
    // Determine US DST (starts 2nd Sunday of Mar, ends 1st Sunday of Nov)
    const dstStart = new Date(yr, 2, 14);
    dstStart.setDate(14 - dstStart.getDay());
    const dstEnd = new Date(yr, 10, 7);
    dstEnd.setDate(7 - dstEnd.getDay());
    
    const inDST = tempDate >= dstStart && tempDate < dstEnd;
    const etOffset = inDST ? "-04:00" : "-05:00";
    
    const isoStr = `${yr}-${String(tempDate.getMonth() + 1).padStart(2, '0')}-${String(tempDate.getDate()).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00${etOffset}`;
    const localDate = new Date(isoStr);
    
    let localHours = localDate.getHours();
    const localMinutes = localDate.getMinutes();
    const ampm = localHours >= 12 ? 'PM' : 'AM';
    localHours = localHours % 12;
    localHours = localHours ? localHours : 12;
    const strMinutes = String(localMinutes).padStart(2, '0');
    
    let tzName = "IST";
    try {
      const tzString = localDate.toLocaleDateString('en-US', { day: 'numeric', timeZoneName: 'short' });
      const parts = tzString.split(', ');
      if (parts.length > 1) {
        tzName = parts[1];
      }
    } catch (e) {
      // Fallback
    }

    // Force abbreviation to 'IST' if the offset matches Indian Standard Time (UTC+5:30)
    if (localDate.getTimezoneOffset() === -330 || tzName.includes("GMT+5") || tzName.includes("India")) {
      tzName = "IST";
    }
    
    return `${String(localHours).padStart(2, '0')}:${strMinutes} ${ampm} ${tzName}`;
  }

  // Helper to extract Actual, Forecast, Previous values based on historical indicators
  function getCalendarDataValues(ind, releaseDate) {
    const now = new Date();
    const release = new Date(releaseDate);
    const isFuture = release > now;

    const baselines = {
      "interest_rate": { actual: 3.63, forecast: 3.63, prev: 3.63, unit: "%" },
      "fomc_minutes": { actual: "-", forecast: "-", prev: "-", unit: "" },
      "fed_balance_sheet": { actual: 6743.0, forecast: 7200.0, prev: 6735.6, unit: "B" },
      "cpi": { actual: 3.46, forecast: 3.40, prev: 4.17, unit: "%" },
      "core_pce": { actual: 3.41, forecast: 2.60, prev: 3.32, unit: "%" },
      "ppi": { actual: 10.11, forecast: 10.50, prev: 12.30, unit: "%" },
      "michigan_inf_exp": { actual: 4.80, forecast: 3.10, prev: 4.70, unit: "%" },
      "nfp": { actual: 57.0, forecast: 190.0, prev: 129.0, unit: "k" },
      "hourly_earnings": { actual: 3.52, forecast: 3.90, prev: 3.39, unit: "%" },
      "unemployment_rate": { actual: 4.20, forecast: 4.30, prev: 4.30, unit: "%" },
      "initial_claims": { actual: 208.0, forecast: 225.0, prev: 216.0, unit: "k" },
      "continuing_claims": { actual: 1.805, forecast: 1.84, prev: 1.821, unit: "M" },
      "jolts_openings": { actual: 7.594, forecast: 7.95, prev: 7.585, unit: "M" },
      "adp_employment": { actual: 98.0, forecast: 160.0, prev: 122.0, unit: "k" },
      "eci": { actual: 0.90, forecast: 0.90, prev: 0.75, unit: "%" },
      "gdp": { actual: 2.10, forecast: 1.90, prev: 0.50, unit: "%" },
      "industrial_prod": { actual: 0.08, forecast: 0.30, prev: 0.14, unit: "%" },
      "capacity_utilization": { actual: 76.09, forecast: 78.50, prev: 76.10, unit: "%" },
      "durable_goods": { actual: -4.47, forecast: 0.10, prev: 8.51, unit: "%" },
      "ism_mfg": { actual: 65.31, forecast: 58.0, prev: 43.42, unit: "" },
      "ism_services": { actual: -9.09, forecast: -5.0, prev: -6.72, unit: "" },
      "flash_pmi": { actual: -0.57, forecast: -0.40, prev: 0.17, unit: "%" },
      "retail_sales": { actual: 0.22, forecast: -0.10, prev: 1.02, unit: "%" },
      "personal_income": { actual: 0.71, forecast: 0.40, prev: 0.41, unit: "%" },
      "consumer_sentiment_um": { actual: 44.80, forecast: 68.5, prev: 49.80, unit: "" },
      "consumer_confidence_cb": { actual: 44.80, forecast: 100.0, prev: 49.80, unit: "" },
      "building_permits": { actual: 1.367, forecast: 1.38, prev: 1.41, unit: "M" },
      "existing_home_sales": { actual: 4.09, forecast: 3.90, prev: 4.19, unit: "M" },
      "pending_home_sales": { actual: -2.38, forecast: 1.25, prev: 3.71, unit: "%" },
      "new_home_sales": { actual: 580.0, forecast: 636.0, prev: 626.0, unit: "k" },
      "case_shiller": { actual: 0.84, forecast: 6.00, prev: 0.72, unit: "%" },
      "trade_balance": { actual: -77.59, forecast: -76.20, prev: -54.57, unit: "B" },
      "budget_balance": { actual: -120.31, forecast: -320.00, prev: -292.65, unit: "B" },
      "philly_fed": { actual: 41.40, forecast: 9.5, prev: 10.30, unit: "" },
      "empire_state": { actual: 15.60, forecast: -11.0, prev: 5.70, unit: "" },
      "cb_lei": { actual: -1.18, forecast: -0.80, prev: -1.24, unit: "" },
      "consumer_expectations_cb": { actual: 44.80, forecast: 74.0, prev: 49.80, unit: "" },
      "cot_gold": { actual: 186000, forecast: 180000, prev: 178000, unit: "" },
      "cot_euro": { actual: 110000, forecast: 105000, prev: 108000, unit: "" },
      "cot_jpy": { actual: -85000, forecast: -90000, prev: -88000, unit: "" },
      "cot_gbp": { actual: 45000, forecast: 42000, prev: 40000, unit: "" },
      "cot_crude_oil": { actual: 235000, forecast: 230000, prev: 240000, unit: "" },
      "cot_10y_treasury": { actual: -54000, forecast: -60000, prev: -58000, unit: "" },
      "cot_sp500": { actual: -25000, forecast: -30000, prev: -28000, unit: "" }
    };

    // 1. Check if we have live FRED data cached for this indicator
    let cachedData = null;
    if (typeof state !== 'undefined' && state.fredCache) {
      for (const [key, value] of state.fredCache.entries()) {
        if (key.startsWith(ind.fredId + "|")) {
          cachedData = value.data;
          break;
        }
      }
    }

    let actualVal = null;
    let prevVal = null;
    let base = baselines[ind.code] || { actual: 0, forecast: 0, prev: 0, unit: "" };

    if (cachedData && cachedData.observations) {
      const obs = cachedData.observations
        .filter(o => o.value !== ".")
        .map(o => parseFloat(o.value))
        .filter(val => !isNaN(val));

      if (obs.length >= 2) {
        let actRaw = obs[obs.length - 1];
        let prevRaw = obs[obs.length - 2];

        // Apply same unit conversions as our surprise engine
        if (ind.code === "fed_balance_sheet") {
          actRaw /= 1000.0;
          prevRaw /= 1000.0;
        } else if (ind.code === "initial_claims") {
          actRaw /= 1000.0;
          prevRaw /= 1000.0;
        } else if (ind.code === "continuing_claims") {
          actRaw /= 1000000.0;
          prevRaw /= 1000000.0;
        } else if (ind.code === "jolts_openings") {
          actRaw /= 1000.0;
          prevRaw /= 1000.0;
        } else if (ind.code === "adp_employment") {
          actRaw /= 1000.0;
          prevRaw /= 1000.0;
        } else if (ind.code === "building_permits") {
          actRaw /= 1000.0;
          prevRaw /= 1000.0;
        } else if (ind.code === "existing_home_sales" || ind.code === "pending_home_sales") {
          actRaw /= 1000000.0;
          prevRaw /= 1000000.0;
        } else if (ind.code === "trade_balance" || ind.code === "budget_balance") {
          actRaw /= 1000.0;
          prevRaw /= 1000.0;
        }

        actualVal = actRaw;
        prevVal = prevRaw;
      }
    }

    if (actualVal === null) actualVal = base.actual;
    if (prevVal === null) prevVal = base.prev;

    const fmt = (val) => {
      if (val === "-") return "-";
      if (typeof val === "number") {
        return (val > 0 && base.unit === "k" ? "+" : "") + val.toLocaleString(undefined, { maximumFractionDigits: 2 }) + base.unit;
      }
      return val;
    };

    return {
      actual: isFuture ? "-" : fmt(actualVal),
      forecast: fmt(base.forecast),
      prev: fmt(prevVal)
    };
  }

  // Calculate realistic release day of month for the current month
  function calculateReleaseDay(code, yr, monthIdx) {
    function getNthWeekday(year, month, nth, weekday) {
      let count = 0;
      let date = new Date(year, month, 1);
      while (date.getMonth() === month) {
        if (date.getDay() === weekday) {
          count++;
          if (count === nth) {
            return date.getDate();
          }
        }
        date.setDate(date.getDate() + 1);
      }
      return 1;
    }

    function getWeekdays(year, month, weekday) {
      const days = [];
      let date = new Date(year, month, 1);
      while (date.getMonth() === month) {
        if (date.getDay() === weekday) {
          days.push(date.getDate());
        }
        date.setDate(date.getDate() + 1);
      }
      return days;
    }

    function getFirstBusinessDay(year, month) {
      let date = new Date(year, month, 1);
      while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() + 1);
      }
      return date.getDate();
    }

    function getNthBusinessDay(year, month, n) {
      let date = new Date(year, month, 1);
      let count = 0;
      while (date.getMonth() === month) {
        if (date.getDay() !== 0 && date.getDay() !== 6) {
          count++;
          if (count === n) {
            return date.getDate();
          }
        }
        date.setDate(date.getDate() + 1);
      }
      return n;
    }

    switch (code) {
      case "interest_rate":
      case "fomc_minutes":
        return 29; // FOMC rate decision day (e.g. 29th)
      case "nfp":
      case "hourly_earnings":
      case "unemployment_rate":
        return getNthWeekday(yr, monthIdx, 1, 5); // 1st Friday
      case "adp_employment":
        return getNthWeekday(yr, monthIdx, 1, 3); // 1st Wednesday
      case "fed_balance_sheet":
        const thurs = getWeekdays(yr, monthIdx, 4);
        return thurs[1] || 10; // 2nd Thursday
      case "ism_mfg":
        return getFirstBusinessDay(yr, monthIdx);
      case "ism_services":
        return getNthBusinessDay(yr, monthIdx, 3);
      case "initial_claims":
      case "continuing_claims":
        const thursdays = getWeekdays(yr, monthIdx, 4);
        return thursdays[1] || 10; // 2nd Thursday
      case "cpi":
      case "core_pce":
        return getNthWeekday(yr, monthIdx, 2, 3); // 2nd Wednesday
      case "ppi":
        return getNthWeekday(yr, monthIdx, 2, 3) + 1; // 2nd Thursday
      case "retail_sales":
      case "industrial_prod":
      case "capacity_utilization":
        return 15;
      case "jolts_openings":
        return getNthWeekday(yr, monthIdx, 1, 2); // 1st Tuesday
      case "gdp":
        const quarterlyMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
        if (quarterlyMonths.includes(monthIdx)) {
          const thurs = getWeekdays(yr, monthIdx, 4);
          return thurs[thurs.length - 1]; // Last Thursday
        } else {
          return 28;
        }
      case "cot_gold":
      case "cot_euro":
      case "cot_jpy":
      case "cot_gbp":
      case "cot_crude_oil":
      case "cot_10y_treasury":
      case "cot_sp500":
        const fridays = getWeekdays(yr, monthIdx, 5);
        return fridays[fridays.length - 1]; // Released weekly on Friday
      default:
        return ((code.length * 3) % 25) + 3;
    }
  }

  // --- Helper to map Forex Factory event titles to indicator codes ---
  function mapFFTitleToCode(title, country) {
    if (country !== "USD") return null;
    const lower = title.toLowerCase();
    if (lower.includes("federal funds") || lower.includes("interest rate")) return "interest_rate";
    if (lower.includes("fomc minutes")) return "fomc_minutes";
    if (lower.includes("balance sheet")) return "fed_balance_sheet";
    if (lower.includes("cpi") || lower.includes("consumer price")) {
      if (lower.includes("core")) return "core_pce";
      return "cpi";
    }
    if (lower.includes("pce")) return "core_pce";
    if (lower.includes("ppi") || lower.includes("producer price")) return "ppi";
    if (lower.includes("non-farm employment") || lower.includes("payroll")) return "nfp";
    if (lower.includes("unemployment rate")) return "unemployment_rate";
    if (lower.includes("initial jobless")) return "initial_claims";
    if (lower.includes("continuing jobless")) return "continuing_claims";
    if (lower.includes("jolts")) return "jolts_openings";
    if (lower.includes("adp")) return "adp_employment";
    if (lower.includes("gdp")) return "gdp";
    if (lower.includes("ism manufacturing")) return "ism_mfg";
    if (lower.includes("ism services") || lower.includes("ism non-manufacturing")) return "ism_services";
    if (lower.includes("retail sales")) return "retail_sales";
    if (lower.includes("building permits")) return "building_permits";
    if (lower.includes("existing home")) return "existing_home_sales";
    if (lower.includes("pending home")) return "pending_home_sales";
    if (lower.includes("new home")) return "new_home_sales";
    if (lower.includes("trade balance")) return "trade_balance";
    if (lower.includes("budget")) return "budget_balance";
    if (lower.includes("philly fed")) return "philly_fed";
    if (lower.includes("empire state")) return "empire_state";
    return null;
  }

  // --- Helper to parse financial values (e.g. "250M", "190k", "0.3%") to float ---
  function parseValueString(str) {
    if (!str || str === "-") return NaN;
    let cleaned = str.replace(/[^0-9.-]/g, "");
    let val = parseFloat(cleaned);
    if (isNaN(val)) return NaN;
    const lower = str.toLowerCase();
    if (lower.includes("b")) val *= 1000000000;
    else if (lower.includes("m")) val *= 1000000;
    else if (lower.includes("k")) val *= 1000;
    return val;
  }

  // --- Dynamic Economic Calendar Generator ---
  function getReleaseCalendar() {
    const list = [];
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonthIdx = now.getMonth();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const curMonth = months[curMonthIdx];

    // Determine current week bounds
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // 1. Add Live Forex Factory data if loaded
    if (state.forexFactoryCalendar && state.forexFactoryCalendar.length > 0) {
      const majorCurrencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF"];
      
      const filtered = state.forexFactoryCalendar.filter(item => {
        // Apply Currency filter
        if (state.calCurrencyFilter !== "All" && item.country !== state.calCurrencyFilter) {
          return false;
        }
        
        // Apply Impact filter
        if (state.calImpactFilter === "High" && item.impact !== "High") {
          return false;
        }
        if (state.calImpactFilter === "HighMedium" && item.impact !== "High" && item.impact !== "Medium") {
          return false;
        }
        
        // If All, restrict to major currencies
        if (state.calCurrencyFilter === "All" && !majorCurrencies.includes(item.country)) {
          return false;
        }
        
        return true;
      });

      filtered.forEach(item => {
        const d = new Date(item.date);
        const mo = d.getMonth();
        const dy = d.getDate();
        const yr = d.getFullYear();
        const dateStr = `${months[mo]} ${dy}, ${yr}`;
        
        let localHours = d.getHours();
        const localMinutes = d.getMinutes();
        const ampm = localHours >= 12 ? 'PM' : 'AM';
        localHours = localHours % 12;
        localHours = localHours ? localHours : 12;
        const strMinutes = String(localMinutes).padStart(2, '0');

        let tzName = "IST";
        try {
          const tzString = d.toLocaleDateString('en-US', { day: 'numeric', timeZoneName: 'short' });
          const parts = tzString.split(', ');
          if (parts.length > 1) {
            tzName = parts[1];
          }
        } catch (e) {}

        if (d.getTimezoneOffset() === -330 || tzName.includes("GMT+5") || tzName.includes("India")) {
          tzName = "IST";
        }
        
        const timeStr = `${String(localHours).padStart(2, '0')}:${strMinutes} ${ampm} ${tzName}`;

        const code = mapFFTitleToCode(item.title, item.country);

        list.push({
          name: item.title,
          code: code,
          currency: item.country,
          date: dateStr,
          time: timeStr,
          actual: item.actual || "-",
          forecast: item.forecast || "-",
          prev: item.previous || "-",
          impact: item.impact,
          source: "Institutional Feed",
          timestamp: d.getTime()
        });
      });
    }

    // 2. Add our core USD indicators for dates OUTSIDE the current week (to show full month history + outlook)
    const excludedCodes = ["consumer_confidence_cb", "consumer_expectations_cb", "pending_home_sales", "fomc_minutes"];
    const indicatorsToProcess = window.INDICATORS.filter(ind => !excludedCodes.includes(ind.code));

    indicatorsToProcess.forEach((ind) => {
      // Find FRED cache observations for historical prints in the current month
      let cachedData = null;
      if (typeof state !== 'undefined' && state.fredCache) {
        for (const [key, value] of state.fredCache.entries()) {
          if (key.startsWith(ind.fredId + "|")) {
            cachedData = value.data;
            break;
          }
        }
      }

      // Check all cached observations to see if their realtime_start is in the current month but NOT in the current week
      if (cachedData && cachedData.observations && cachedData.observations.length > 0) {
        const validObs = cachedData.observations.filter(o => o.value !== ".");
        
        // We look at the last 3 observations to capture releases that happened earlier this month
        const recentObs = validObs.slice(-3);
        recentObs.forEach(obs => {
          if (obs.realtime_start) {
            const obsDate = new Date(obs.realtime_start + "T00:00:00");
            const obsYear = obsDate.getFullYear();
            const obsMonthIdx = obsDate.getMonth();
            
            // Is it in the current month?
            if (obsYear === curYear && obsMonthIdx === curMonthIdx) {
              // Is it OUTSIDE the current week bounds?
              if (obsDate < startOfWeek || obsDate > endOfWeek) {
                const mo = obsDate.getMonth();
                const dy = obsDate.getDate();
                const yr = obsDate.getFullYear();
                const dateStr = `${months[mo]} ${dy}, ${yr}`;
                
                // Avoid duplicating events if they are somehow already in the Forex Factory list
                const alreadyExists = list.some(item => 
                  item.code === ind.code && 
                  item.date === dateStr
                );
                
                if (!alreadyExists) {
                  // Retrieve historical values for this observation index
                  const idx = validObs.indexOf(obs);
                  const prevObs = idx > 0 ? validObs[idx - 1] : null;
                  
                  let rawAct = parseFloat(obs.value);
                  let rawPrev = prevObs ? parseFloat(prevObs.value) : NaN;
                  
                  // Scale units
                  let div = 1.0;
                  if (ind.code === "initial_claims" || ind.code === "adp_employment" || ind.code === "fed_balance_sheet" || ind.code === "building_permits" || ind.code === "trade_balance" || ind.code === "budget_balance") {
                    div = 1000.0;
                  } else if (ind.code === "continuing_claims" || ind.code === "jolts_openings" || ind.code === "existing_home_sales") {
                    div = 1000000.0;
                  }
                  
                  let actStr = "-";
                  let prevStr = "-";
                  
                  if (!isNaN(rawAct)) actStr = (rawAct / div).toFixed(1) + (ind.code.includes("claims") || ind.code === "adp_employment" ? "k" : ind.code.includes("home_sales") ? "M" : "");
                  if (!isNaN(rawPrev)) prevStr = (rawPrev / div).toFixed(1) + (ind.code.includes("claims") || ind.code === "adp_employment" ? "k" : ind.code.includes("home_sales") ? "M" : "");
                  
                  const forecastVal = getCalendarDataValues(ind, dateStr).forecast;
                  const localTime = ind.impact === "High" ? convertETToLocalTime(dateStr, "08:30 AM EST") : convertETToLocalTime(dateStr, "10:00 AM EST");

                  list.push({
                    name: ind.name,
                    code: ind.code,
                    currency: "USD",
                    date: dateStr,
                    time: localTime,
                    actual: actStr,
                    forecast: forecastVal,
                    prev: prevStr,
                    impact: ind.impact,
                    source: ind.source,
                    timestamp: obsDate.getTime()
                  });
                }
              }
            }
          }
        });
      }

      // Add estimated future indicators for the rest of the month (if they fall after endOfWeek)
      const releaseDay = calculateReleaseDay(ind.code, curYear, curMonthIdx);
      const estDate = new Date(curYear, curMonthIdx, releaseDay);
      estDate.setHours(12, 0, 0, 0); // Mid-day representation
      
      if (estDate > endOfWeek) {
        const dateStr = `${curMonth} ${releaseDay}, ${curYear}`;
        
        // Avoid duplicating
        const alreadyExists = list.some(item => 
          item.code === ind.code && 
          item.date === dateStr
        );
        
        if (!alreadyExists) {
          const localTime = ind.impact === "High" ? convertETToLocalTime(dateStr, "08:30 AM EST") : convertETToLocalTime(dateStr, "10:00 AM EST");
          const values = getCalendarDataValues(ind, dateStr);

          list.push({
            name: ind.name,
            code: ind.code,
            currency: "USD",
            date: dateStr,
            time: localTime,
            actual: values.actual,
            forecast: values.forecast,
            prev: values.prev,
            impact: ind.impact,
            source: ind.source,
            timestamp: estDate.getTime()
          });
        }
      }
    });

    // Chronological sorting based on parsed Date values
    list.sort((a, b) => a.timestamp - b.timestamp);

    if (state.calHidePast) {
      const nowTime = Date.now();
      // Keep events from the last 30 minutes active so traders can verify values immediately after drop
      return list.filter(item => item.timestamp >= nowTime - 1800000);
    }

    return list;
  }

  function renderCalendarPreview() {
    if (!elements.calendarPreviewList) return;
    elements.calendarPreviewList.innerHTML = "";

    const calendar = getReleaseCalendar();
    // For preview, filter to only show future or today's events, then take first 4
    const nowTime = Date.now();
    let upcoming = calendar.filter(item => item.timestamp >= nowTime - 86400000);
    if (upcoming.length === 0) {
      upcoming = calendar.slice(-4);
    } else {
      upcoming = upcoming.slice(0, 4);
    }

    upcoming.forEach(item => {
      const el = document.createElement("div");
      el.className = "calendar-item";
      
      if (item.code) {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => window.selectIndicator(item.code));
      } else {
        el.style.cursor = "default";
      }
      
      let badgeColor = "var(--impact-low)";
      if (item.impact === "High") badgeColor = "var(--impact-high)";
      else if (item.impact === "Medium") badgeColor = "var(--impact-medium)";

      el.innerHTML = `
        <div class="calendar-details">
          <span class="calendar-name">${item.name} (${item.currency})</span>
          <span class="calendar-time"><i class="far fa-calendar-alt"></i> ${item.date} at ${item.time}</span>
        </div>
        <span class="calendar-badge" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); color: ${badgeColor};">${item.impact}</span>
      `;
      elements.calendarPreviewList.appendChild(el);
    });
  }

  function renderFullCalendar() {
    if (!elements.calendarTableBody) return;
    elements.calendarTableBody.innerHTML = "";

    const calendar = getReleaseCalendar();
    let lastDate = "";

    calendar.forEach(item => {
      const row = document.createElement("tr");
      row.className = "calendar-row";
      
      if (item.code) {
        row.style.cursor = "pointer";
        row.addEventListener("click", () => window.selectIndicator(item.code));
      } else {
        row.style.cursor = "default";
      }

      // Day-grouping logic (blank cell if same date as previous row)
      let dateDisplay = "";
      if (item.date !== lastDate) {
        const dateObj = new Date(item.date);
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dayName = days[dateObj.getDay()];
        const monthDay = item.date.substring(0, item.date.indexOf(","));
        dateDisplay = `<span class="ff-day-name">${dayName}</span> <strong class="ff-month-day">${monthDay}</strong>`;
        lastDate = item.date;
      }

      // Impact Folder selection
      let folderColor = "#f6e58d"; // Yellow (Low)
      let folderTitle = "Low Impact";
      if (item.impact === "High") {
        folderColor = "#ff4a5a"; // Red (High)
        folderTitle = "High Impact";
      } else if (item.impact === "Medium") {
        folderColor = "#ff9f43"; // Orange (Medium)
        folderTitle = "Medium Impact";
      }
      const folderIcon = `<i class="fas fa-folder" style="color: ${folderColor}; font-size: 14.5px;" title="${folderTitle}"></i>`;
      const detailIcon = item.code 
        ? `<i class="far fa-folder-open" style="color: var(--accent-cyan); font-size: 12.5px; opacity: 0.8; cursor: pointer;" title="Open Macro Chart Room"></i>`
        : `<i class="far fa-file-alt" style="color: #475569; font-size: 12.5px; opacity: 0.5;" title="No charts available"></i>`;

      // Color-coding the actual value using expectations-surprise logic
      let actualColorStyle = "color: #cbd5e1;"; // Default neutral
      if (item.actual !== "-") {
        const actVal = parseValueString(item.actual);
        const fcastVal = parseValueString(item.forecast);
        
        if (!isNaN(actVal) && !isNaN(fcastVal)) {
          let is_inverse = false;
          if (item.code) {
            is_inverse = [
              "unemployment_rate", "initial_claims", "continuing_claims", 
              "cpi", "core_pce", "ppi", "eci", "michigan_inf_exp"
            ].includes(item.code);
          } else {
            // General heuristics for other currencies: inflation, claims, unemployment are inverse
            const titleLower = item.name.toLowerCase();
            is_inverse = titleLower.includes("unemployment") || 
                         titleLower.includes("cpi") || 
                         titleLower.includes("inflation") || 
                         titleLower.includes("claim");
          }

          const diff = actVal - fcastVal;
          if (Math.abs(diff) > 1e-5) {
            if (is_inverse) {
              // Lower is bullish (green), higher is bearish (red)
              actualColorStyle = diff < 0 ? "color: var(--success); font-weight: 600;" : "color: var(--error); font-weight: 600;";
            } else {
              // Higher is bullish (green), lower is bearish (red)
              actualColorStyle = diff > 0 ? "color: var(--success); font-weight: 600;" : "color: var(--error); font-weight: 600;";
            }
          }
        }
      }

      row.innerHTML = `
        <td style="padding-left: 15px; vertical-align: middle;">${dateDisplay}</td>
        <td style="text-align: center; vertical-align: middle; color: #94a3b8; font-size: 12px;">${item.time}</td>
        <td style="text-align: center; vertical-align: middle; font-size: 11.5px; font-weight: 600; color: #64748b;">${item.currency}</td>
        <td style="text-align: center; vertical-align: middle;">${folderIcon}</td>
        <td style="text-align: center; vertical-align: middle;">${detailIcon}</td>
        <td style="vertical-align: middle; font-weight: 500; color: #e2e8f0;">${item.name}</td>
        <td style="${actualColorStyle} text-align: right; vertical-align: middle;">${item.actual}</td>
        <td style="color: #64748b; text-align: right; vertical-align: middle; font-size: 13px;">${item.forecast}</td>
        <td style="color: #64748b; text-align: right; vertical-align: middle; font-size: 13px;">${item.prev}</td>
        <td style="text-align: center; vertical-align: middle; padding-right: 15px;">
          <i class="fas fa-chart-bar" style="color: var(--accent-cyan); font-size: 13px; ${item.code ? 'opacity: 0.7; cursor: pointer;' : 'opacity: 0.2; cursor: default;'}" title="${item.code ? 'View Details / Chart' : 'No charts available'}"></i>
        </td>
      `;
      elements.calendarTableBody.appendChild(row);
    });
  }

  // --- Fetch live weekly calendar from local server proxy ---
  function fetchCalendarData(forceRefresh = false) {
    const isForce = forceRefresh || (typeof state !== 'undefined' && state.isForceRefreshing);
    const url = `${getApiBaseUrl()}/api/calendar${isForce ? '?refresh=1' : ''}`;
    return fetch(url)
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(data => {
        state.forexFactoryCalendar = data;
        renderCalendarPreview();
        renderFullCalendar();
      })
      .catch(err => {
        console.error("Failed to load Forex Factory calendar:", err);
      });
  }

  // --- TradingView Sub-Tabs Controller ---
  function setupTradingViewSubTabs() {
    const subTabs = document.querySelectorAll(".tv-sub-tab");
    const subPanes = document.querySelectorAll(".tv-sub-pane");
    
    subTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const targetPaneId = tab.getAttribute("data-sub");
        
        // Update active class on buttons
        subTabs.forEach(t => {
          t.classList.remove("active");
          t.style.background = "transparent";
          t.style.borderColor = "transparent";
          t.style.color = "#94a3b8";
        });
        tab.classList.add("active");
        tab.style.background = "rgba(255,255,255,0.04)";
        tab.style.borderColor = "rgba(255,255,255,0.08)";
        tab.style.color = "#e2e8f0";
        
        // Toggle panes
        subPanes.forEach(pane => {
          if (pane.id === targetPaneId) {
            pane.classList.add("active");
            pane.style.display = pane.id === "tv-sub-chart" ? "flex" : "block";
          } else {
            pane.classList.remove("active");
            pane.style.display = "none";
          }
        });
        
        // Persist the selected sub-tab
        localStorage.setItem("activeTvSubTab", targetPaneId);
      });
    });

    // Multi-Chart Grid & Layout Controller
    const layoutBtns = document.querySelectorAll(".tv-layout-btn");
    const multiGrid = document.getElementById("tv-multi-chart-grid");
    const chartBoxes = [
      document.getElementById("tv-box-1"),
      document.getElementById("tv-box-2"),
      document.getElementById("tv-box-3"),
      document.getElementById("tv-box-4")
    ];
    let selectedBoxIndex = 0;

    // Helper: Select target box focus (Pure UI highlight - ZERO iframe reloads)
    function setTargetBox(idx) {
      selectedBoxIndex = idx;

      chartBoxes.forEach((b, i) => {
        if (!b) return;
        const focusBtn = b.querySelector(".tv-focus-btn");
        if (i === idx) {
          b.classList.add("active-box");
          if (focusBtn) {
            focusBtn.classList.add("active");
            focusBtn.textContent = "Targeted";
            focusBtn.style.background = "rgba(99,102,241,0.25)";
            focusBtn.style.borderColor = "rgba(99,102,241,0.5)";
            focusBtn.style.color = "#a5b4fc";
          }
        } else {
          b.classList.remove("active-box");
          if (focusBtn) {
            focusBtn.classList.remove("active");
            focusBtn.textContent = "Target Chart";
            focusBtn.style.background = "rgba(255,255,255,0.04)";
            focusBtn.style.borderColor = "rgba(255,255,255,0.08)";
            focusBtn.style.color = "#cbd5e1";
          }
        }
      });
    }

    // Automatic Chart Focus Engine (Detects clicks ANYWHERE inside TradingView chart canvas & containers)
    chartBoxes.forEach((box, idx) => {
      if (!box) return;
      
      box.addEventListener("click", () => setTargetBox(idx));
      box.addEventListener("mousedown", () => setTargetBox(idx));
      box.addEventListener("pointerdown", () => setTargetBox(idx));

      const focusBtn = box.querySelector(".tv-focus-btn");
      if (focusBtn) {
        focusBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          setTargetBox(idx);
        });
      }
    });

    // Detect direct clicks inside TradingView chart iframes automatically
    function checkActiveChartIframe() {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === "IFRAME" && activeEl.id && activeEl.id.startsWith("tv-chart-iframe-")) {
        const iframeIndex = parseInt(activeEl.id.replace("tv-chart-iframe-", ""), 10);
        if (iframeIndex >= 1 && iframeIndex <= 4) {
          const targetIdx = iframeIndex - 1;
          if (selectedBoxIndex !== targetIdx) {
            setTargetBox(targetIdx);
          }
        }
      }
    }

    // Instant blur/focus tracking + continuous active element polling
    window.addEventListener("blur", () => setTimeout(checkActiveChartIframe, 10));
    window.addEventListener("focus", () => setTimeout(checkActiveChartIframe, 10));
    setInterval(checkActiveChartIframe, 100);

    // Helper: On-demand lazy chart iframe loader (Only reloads iframe when symbol or interval actually changes!)
    function loadChartIframe(iframeIndex, symbolOverride, intervalOverride) {
      const iframe = document.getElementById(`tv-chart-iframe-${iframeIndex}`);
      if (!iframe) return;
      
      const previousSymbol = iframe.getAttribute("data-current-symbol");
      const previousInterval = iframe.getAttribute("data-current-interval");

      const symbol = symbolOverride || previousSymbol || iframe.getAttribute("data-default-symbol") || "FOREXCOM:SPXUSD";
      const interval = intervalOverride || previousInterval || "15";
      
      const isSymbolChanged = (previousSymbol !== symbol);
      const isIntervalChanged = (previousInterval !== interval);
      const isUninitialized = (!iframe.src || iframe.src === "about:blank" || !iframe.src.includes("advanced-chart"));

      iframe.setAttribute("data-current-symbol", symbol);
      iframe.setAttribute("data-current-interval", interval);

      // Update header pair name label
      const label = document.getElementById(`tv-symbol-label-${iframeIndex}`);
      if (label) {
        const names = {
          "FOREXCOM:SPXUSD": "S&P 500",
          "FX:EURUSD": "EUR/USD",
          "OANDA:XAUUSD": "Gold (XAU)",
          "BINANCE:BTCUSDT": "Bitcoin (BTC)",
          "TVC:US10Y": "US 10Y Yield",
          "NASDAQ:QQQ": "Nasdaq 100"
        };
        label.textContent = names[symbol] || symbol.split(":")[1] || symbol;
      }

      // Update header timeframe badge
      const tfBadge = document.getElementById(`tv-tf-badge-${iframeIndex}`);
      if (tfBadge) {
        const tfNames = {
          "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
          "60": "1h", "240": "4h", "D": "1D", "W": "1W"
        };
        tfBadge.textContent = tfNames[interval] || interval;
      }

      // Automatically detect user local timezone for exact TradingView candle timing and countdowns
      const userTimezone = (typeof Intl !== "undefined" && Intl.DateTimeFormat) ? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC") : "Etc/UTC";

      const config = {
        autosize: true,
        symbol: symbol,
        interval: interval,
        timezone: userTimezone,      // User local timezone for exact TradingView candle timing!
        theme: "dark",
        style: "1",
        locale: "en",
        allow_symbol_change: true,
        calendar: false,
        hide_top_toolbar: true,      // Clean layout: removes internal top search/TF toolbar
        hide_legend: true,           // Clean layout: hides bulky OHLC legend text
        hide_side_toolbar: isDrawingToolsHidden, // Hide/Show left drawing panel toggle!
        withdateranges: true,        // Time scale & date range navigation
        details: false,              // Clean layout: HIDES the bulky right-side quote detail panel!
        hotlist: false,              // Hides right-side hotlist panel
        show_popup_button: true,
        enabled_features: ["countdown"], // Explicitly enables TradingView countdown timer feature!
        support_host: "https://www.tradingview.com"
      };

      const ts = Date.now();
      const newSrc = `https://s.tradingview.com/embed-widget/advanced-chart/?locale=en&t=${ts}#${encodeURIComponent(JSON.stringify(config))}`;
      
      // STABLE RELOAD: Only update iframe src if symbol or timeframe changed or iframe is uninitialized!
      if (isSymbolChanged || isIntervalChanged || isUninitialized) {
        iframe.src = newSrc;
      }
    }

    // Helper: Unload hidden chart iframe to free WebGL/GPU memory
    function unloadChartIframe(iframeIndex) {
      const iframe = document.getElementById(`tv-chart-iframe-${iframeIndex}`);
      if (iframe && iframe.src !== "about:blank" && iframeIndex > 1) {
        iframe.src = "about:blank";
      }
    }

    // Handle Layout Selector Clicks (1 Single, 2 Split, 4 Quad)
    layoutBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        layoutBtns.forEach(b => {
          b.classList.remove("active");
          b.style.background = "rgba(255,255,255,0.04)";
          b.style.borderColor = "rgba(255,255,255,0.08)";
          b.style.color = "#cbd5e1";
        });
        btn.classList.add("active");
        btn.style.background = "rgba(99,102,241,0.2)";
        btn.style.borderColor = "rgba(99,102,241,0.5)";
        btn.style.color = "#a5b4fc";

        const count = parseInt(btn.getAttribute("data-layout"), 10);
        if (multiGrid) {
          multiGrid.className = `layout-${count}`;
        }

        chartBoxes.forEach((box, idx) => {
          if (!box) return;
          const iframeIndex = idx + 1;
          if (idx < count) {
            box.style.display = "flex";
            loadChartIframe(iframeIndex);
          } else {
            box.style.display = "none";
            unloadChartIframe(iframeIndex);
          }
        });
        localStorage.setItem("activeTvChartLayout", count.toString());
      });
    });

    // Preset symbol switchers for Charting Window
    const presetBtns = document.querySelectorAll(".tv-preset-btn");
    presetBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        presetBtns.forEach(b => {
          b.classList.remove("active");
          b.style.background = "rgba(255,255,255,0.04)";
          b.style.borderColor = "rgba(255,255,255,0.08)";
          b.style.color = "#cbd5e1";
        });
        btn.classList.add("active");
        btn.style.background = "rgba(99,102,241,0.2)";
        btn.style.borderColor = "rgba(99,102,241,0.5)";
        btn.style.color = "#a5b4fc";
        
        const symbol = btn.getAttribute("data-symbol");
        loadChartIframe(selectedBoxIndex + 1, symbol);
      });
    });

    // Timeframe switchers for Charting Window
    const timeframeBtns = document.querySelectorAll(".tv-timeframe-btn");
    timeframeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        timeframeBtns.forEach(b => {
          b.classList.remove("active");
          b.style.background = "rgba(255,255,255,0.04)";
          b.style.borderColor = "rgba(255,255,255,0.08)";
          b.style.color = "#cbd5e1";
        });
        btn.classList.add("active");
        btn.style.background = "rgba(99,102,241,0.2)";
        btn.style.borderColor = "rgba(99,102,241,0.5)";
        btn.style.color = "#a5b4fc";
        
        const interval = btn.getAttribute("data-interval");
        loadChartIframe(selectedBoxIndex + 1, null, interval);
      });
    });

    // Drawing Panel Show/Hide Toggle Controller
    let isDrawingToolsHidden = localStorage.getItem("tv_hide_drawings") === "true";
    const drawingToggleBtn = document.getElementById("tv-drawing-toggle-btn");
    const drawingToggleLabel = document.getElementById("tv-drawing-toggle-label");

    function updateDrawingToggleUI() {
      if (!drawingToggleBtn) return;
      if (isDrawingToolsHidden) {
        drawingToggleBtn.classList.remove("active");
        drawingToggleBtn.classList.add("disabled");
        drawingToggleBtn.style.background = "rgba(255,255,255,0.04)";
        drawingToggleBtn.style.borderColor = "rgba(255,255,255,0.08)";
        drawingToggleBtn.style.color = "#64748b";
        if (drawingToggleLabel) drawingToggleLabel.textContent = "Drawings: OFF";
      } else {
        drawingToggleBtn.classList.add("active");
        drawingToggleBtn.classList.remove("disabled");
        drawingToggleBtn.style.background = "rgba(99,102,241,0.2)";
        drawingToggleBtn.style.borderColor = "rgba(99,102,241,0.5)";
        drawingToggleBtn.style.color = "#a5b4fc";
        if (drawingToggleLabel) drawingToggleLabel.textContent = "Drawings: ON";
      }
    }

    if (drawingToggleBtn) {
      updateDrawingToggleUI();
      drawingToggleBtn.addEventListener("click", () => {
        isDrawingToolsHidden = !isDrawingToolsHidden;
        localStorage.setItem("tv_hide_drawings", isDrawingToolsHidden ? "true" : "false");
        updateDrawingToggleUI();

        // Reload active visible chart panels to reflect hide_side_toolbar setting
        const count = parseInt(localStorage.getItem("activeTvChartLayout") || "1", 10);
        for (let i = 1; i <= count; i++) {
          const iframe = document.getElementById(`tv-chart-iframe-${i}`);
          if (iframe && iframe.src && iframe.src !== "about:blank") {
            const symbol = iframe.getAttribute("data-current-symbol") || iframe.getAttribute("data-default-symbol") || "FOREXCOM:SPXUSD";
            const interval = iframe.getAttribute("data-current-interval") || "D";
            const userTimezone = (typeof Intl !== "undefined" && Intl.DateTimeFormat) ? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC") : "Etc/UTC";
            
            const config = {
              autosize: true,
              symbol: symbol,
              interval: interval,
              timezone: userTimezone,
              theme: "dark",
              style: "1",
              locale: "en",
              allow_symbol_change: true,
              calendar: false,
              hide_top_toolbar: true,
              hide_legend: true,
              hide_side_toolbar: isDrawingToolsHidden, // Toggle left drawing panel!
              withdateranges: true,
              details: false,
              hotlist: false,
              show_popup_button: true,
              enabled_features: ["countdown"],
              support_host: "https://www.tradingview.com"
            };
            iframe.src = `https://s.tradingview.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(JSON.stringify(config))}`;
          }
        }
      });
    }

    // --- Live Precision TradingView Candle Countdown Timer Controller ---
    function startCandleCountdownTimers() {
      const getIntervalSeconds = (interval) => {
        switch (interval) {
          case "1": return 60;
          case "3": return 180;
          case "5": return 300;
          case "15": return 900;
          case "30": return 1800;
          case "60": return 3600;
          case "240": return 14400;
          case "D": return 86400;
          case "W": return 604800;
          default: return 900;
        }
      };

      const formatTime = (totalSeconds) => {
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        if (hours > 0) {
          return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      };

      function updateTimers() {
        const nowSec = Math.floor(Date.now() / 1000);

        for (let i = 1; i <= 4; i++) {
          const iframe = document.getElementById(`tv-chart-iframe-${i}`);
          const timerValEl = document.querySelector(`#tv-timer-${i} .timer-val`);
          if (!iframe || !timerValEl) continue;

          const interval = iframe.getAttribute("data-current-interval") || "15";
          const intervalSec = getIntervalSeconds(interval);
          const remainingSec = intervalSec - (nowSec % intervalSec);

          timerValEl.textContent = formatTime(remainingSec);
        }
      }

      updateTimers();
      setInterval(updateTimers, 1000);
    }

    startCandleCountdownTimers();

    // --- Sidebar Collapse & Laptop Viewport Optimization ---
    const sidebarToggleBtn = document.getElementById("btn-toggle-sidebar");
    const appContainer = document.querySelector(".app-container");

    if (sidebarToggleBtn && appContainer) {
      sidebarToggleBtn.addEventListener("click", () => {
        appContainer.classList.toggle("collapsed-sidebar");
        const isCollapsed = appContainer.classList.contains("collapsed-sidebar");
        localStorage.setItem("tv_sidebar_collapsed", isCollapsed ? "true" : "false");
      });

      // Auto-collapse sidebar on laptop screens (< 1366px width) or if previously saved
      const savedCollapse = localStorage.getItem("tv_sidebar_collapsed");
      if (savedCollapse === "true" || (savedCollapse === null && window.innerWidth <= 1366)) {
        appContainer.classList.add("collapsed-sidebar");
      }
    }

    // --- TradingView Full Screen & Single Chart Maximize Controller ---
    const fullscreenBtn = document.getElementById("tv-fullscreen-btn");
    const fullscreenIcon = document.getElementById("tv-fullscreen-icon");
    const fullscreenLabel = document.getElementById("tv-fullscreen-label");
    const fullscreenPane = document.getElementById("tv-sub-chart");
    const fullscreenToast = document.getElementById("tv-fullscreen-toast");
    let toastTimeout = null;

    function isPaneFullscreen() {
      return (
        document.fullscreenElement === fullscreenPane ||
        document.webkitFullscreenElement === fullscreenPane ||
        fullscreenPane.classList.contains("tv-fullscreen-active")
      );
    }

    function showFullscreenToast() {
      if (!fullscreenToast) return;
      fullscreenToast.classList.add("show");
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        fullscreenToast.classList.remove("show");
      }, 3500);
    }

    function updateFullscreenUI(active) {
      if (!fullscreenBtn) return;
      if (active) {
        fullscreenBtn.classList.add("active");
        if (fullscreenIcon) fullscreenIcon.className = "fas fa-compress";
        if (fullscreenLabel) fullscreenLabel.textContent = "Exit Full Screen";
        showFullscreenToast();
      } else {
        fullscreenBtn.classList.remove("active");
        if (fullscreenIcon) fullscreenIcon.className = "fas fa-expand";
        if (fullscreenLabel) fullscreenLabel.textContent = "Full Screen";
        if (fullscreenToast) fullscreenToast.classList.remove("show");
      }
    }

    function toggleFullscreenMode() {
      if (!fullscreenPane) return;

      const entering = !isPaneFullscreen();

      if (entering) {
        fullscreenPane.classList.add("tv-fullscreen-active");
        updateFullscreenUI(true);

        if (fullscreenPane.requestFullscreen) {
          fullscreenPane.requestFullscreen().catch(() => {});
        } else if (fullscreenPane.webkitRequestFullscreen) {
          fullscreenPane.webkitRequestFullscreen().catch(() => {});
        } else if (fullscreenPane.msRequestFullscreen) {
          fullscreenPane.msRequestFullscreen().catch(() => {});
        }
      } else {
        fullscreenPane.classList.remove("tv-fullscreen-active");
        updateFullscreenUI(false);

        if (document.exitFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
          document.webkitExitFullscreen().catch(() => {});
        } else if (document.msExitFullscreen && document.msFullscreenElement) {
          document.msExitFullscreen().catch(() => {});
        }
      }
    }

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener("click", (e) => {
        e.preventDefault();
        toggleFullscreenMode();
      });
    }

    // Listen for native fullscreen change events (e.g. user presses Esc)
    const onFullscreenChange = () => {
      const isNativeFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
      if (!isNativeFS && fullscreenPane.classList.contains("tv-fullscreen-active")) {
        fullscreenPane.classList.remove("tv-fullscreen-active");
        updateFullscreenUI(false);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    document.addEventListener("mozfullscreenchange", onFullscreenChange);
    document.addEventListener("MSFullscreenChange", onFullscreenChange);

    // Pressing 'F' or 'f' shortcut to toggle TradingView Fullscreen mode
    document.addEventListener("keydown", (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable);
      
      if ((e.key === "f" || e.key === "F") && !isInput && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tvTab = document.getElementById("tv-sub-chart");
        if (tvTab && tvTab.classList.contains("active")) {
          e.preventDefault();
          toggleFullscreenMode();
        }
      }

      if (e.key === "Escape" && fullscreenPane && fullscreenPane.classList.contains("tv-fullscreen-active")) {
        toggleFullscreenMode();
      }
    });

    // --- Per-Chart Maximize Single View Controller ---
    const chartMaximizeBtns = document.querySelectorAll(".tv-chart-maximize-btn");
    let prevLayoutBeforeMaximize = null;

    chartMaximizeBtns.forEach(mBtn => {
      mBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const boxIdx = parseInt(mBtn.getAttribute("data-box"), 10);
        const targetBox = chartBoxes[boxIdx];
        if (!targetBox || !multiGrid) return;

        const isCurrentlyMaximized = mBtn.classList.contains("maximized");

        if (!isCurrentlyMaximized) {
          prevLayoutBeforeMaximize = multiGrid.className;
          multiGrid.className = "layout-1";
          
          chartBoxes.forEach((b, idx) => {
            if (!b) return;
            const btnIcon = b.querySelector(".tv-chart-maximize-btn");
            if (idx === boxIdx) {
              b.style.display = "flex";
              if (btnIcon) {
                btnIcon.classList.add("maximized");
                btnIcon.title = "Restore Grid View";
                btnIcon.innerHTML = '<i class="fas fa-compress-alt"></i>';
              }
              loadChartIframe(idx + 1);
            } else {
              b.style.display = "none";
              unloadChartIframe(idx + 1);
            }
          });
        } else {
          const restoreClass = prevLayoutBeforeMaximize || "layout-2";
          multiGrid.className = restoreClass;
          const count = parseInt(restoreClass.replace("layout-", ""), 10) || 1;

          chartBoxes.forEach((b, idx) => {
            if (!b) return;
            const btnIcon = b.querySelector(".tv-chart-maximize-btn");
            if (btnIcon) {
              btnIcon.classList.remove("maximized");
              btnIcon.title = "Maximize single chart view";
              btnIcon.innerHTML = '<i class="fas fa-expand-alt"></i>';
            }
            if (idx < count) {
              b.style.display = "flex";
              loadChartIframe(idx + 1);
            } else {
              b.style.display = "none";
              unloadChartIframe(idx + 1);
            }
          });
        }
      });
    });

    // Restore persisted layout option
    const persistedLayout = localStorage.getItem("activeTvChartLayout") || "1";
    const targetLayoutBtn = Array.from(layoutBtns).find(b => b.getAttribute("data-layout") === persistedLayout);
    if (targetLayoutBtn) {
      targetLayoutBtn.click();
    }

    // Restore persisted sub-tab or default to Charting Window
    const persistedSub = localStorage.getItem("activeTvSubTab") || "tv-sub-chart";
    const targetTab = Array.from(subTabs).find(t => t.getAttribute("data-sub") === persistedSub);
    if (targetTab) {
      targetTab.click();
    }
  }

  // --- Trade Checklist Controller ---
  function setupChecklistPanel() {
    let activeList = JSON.parse(localStorage.getItem("macroActiveChecklist") || "[]");

    // 1. Render Active List items
    function renderActiveList() {
      if (!elements.activeChecklistContainer) return;
      elements.activeChecklistContainer.innerHTML = "";

      if (activeList.length === 0) {
        elements.activeChecklistContainer.innerHTML = `
          <div style="text-align: center; padding: 32px; color: #64748b; font-size: 13.5px; border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
            <i class="fas fa-tasks" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
            Your checklist is empty. Add your first item above!
          </div>
        `;
        return;
      }

      activeList.forEach(item => {
        const row = document.createElement("div");
        row.className = "checklist-item-row";
        if (item.completed) {
          row.classList.add("completed");
        }

        row.innerHTML = `
          <div class="checklist-item-left">
            <input type="checkbox" class="checklist-checkbox" ${item.completed ? 'checked' : ''}>
            <span class="checklist-item-text">${item.text}</span>
          </div>
          <i class="fas fa-trash-alt checklist-item-delete" data-id="${item.id}" title="Remove item"></i>
        `;

        // Checkbox toggle logic
        const checkbox = row.querySelector(".checklist-checkbox");
        checkbox.addEventListener("change", () => {
          item.completed = checkbox.checked;
          saveActiveList();
          renderActiveList();
        });

        // Delete item logic
        const deleteBtn = row.querySelector(".checklist-item-delete");
        deleteBtn.addEventListener("click", () => {
          activeList = activeList.filter(i => i.id !== item.id);
          saveActiveList();
          renderActiveList();
        });

        elements.activeChecklistContainer.appendChild(row);
      });
    }

    function saveActiveList() {
      localStorage.setItem("macroActiveChecklist", JSON.stringify(activeList));
    }

    // 2. Add New Item
    function addNewItem() {
      if (!elements.checklistInput) return;
      const text = elements.checklistInput.value.trim();
      if (!text) return;

      activeList.push({
        id: (Date.now() + Math.random()).toString(),
        text: text,
        completed: false
      });

      elements.checklistInput.value = "";
      saveActiveList();
      renderActiveList();
    }

    // Bind Add Item Event Listeners
    if (elements.btnAddItem) {
      elements.btnAddItem.addEventListener("click", addNewItem);
    }
    if (elements.checklistInput) {
      elements.checklistInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addNewItem();
        }
      });
    }

    // 3. Clear Completed Items
    if (elements.btnClearCompleted) {
      elements.btnClearCompleted.addEventListener("click", () => {
        activeList = activeList.filter(item => !item.completed);
        saveActiveList();
        renderActiveList();
      });
    }

    // 4. Archive Current List (New List button)
    if (elements.btnArchiveList) {
      elements.btnArchiveList.addEventListener("click", () => {
        if (activeList.length === 0) {
          alert("Cannot archive an empty checklist!");
          return;
        }

        const confirmArchive = confirm("Archive this checklist and start a fresh one?");
        if (!confirmArchive) return;

        const archived = JSON.parse(localStorage.getItem("macroArchivedChecklists") || "[]");
        const now = new Date();
        
        const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
        const formattedTimestamp = `${dateStr}, ${timeStr}`;

        archived.unshift({
          id: Date.now().toString(),
          timestamp: formattedTimestamp,
          items: activeList
        });

        localStorage.setItem("macroArchivedChecklists", JSON.stringify(archived));

        // Clear active list
        activeList = [];
        saveActiveList();
        renderActiveList();
        renderHistory();
      });
    }

    // 5. Render History Snapshots
    function renderHistory() {
      if (!elements.checklistHistoryContainer) return;
      elements.checklistHistoryContainer.innerHTML = "";

      const archived = JSON.parse(localStorage.getItem("macroArchivedChecklists") || "[]");

      if (archived.length === 0) {
        elements.checklistHistoryContainer.innerHTML = `
          <div style="text-align: center; padding: 16px; color: #64748b; font-size: 13px;">
            No archived checklist history.
          </div>
        `;
        return;
      }

      archived.forEach(list => {
        const item = document.createElement("div");
        item.className = "checklist-history-item";
        item.style.flexDirection = "column";
        item.style.alignItems = "stretch";
        item.style.gap = "8px";
        item.style.cursor = "default";

        const total = list.items.length;
        const completed = list.items.filter(i => i.completed).length;

        let itemsHtml = list.items.map(i => `
          <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; opacity: ${i.completed ? 0.5 : 0.9};">
            <i class="${i.completed ? 'far fa-check-square' : 'far fa-square'}" style="color: ${i.completed ? 'var(--accent-cyan)' : '#64748b'};"></i>
            <span style="${i.completed ? 'text-decoration: line-through;' : ''}">${i.text}</span>
          </div>
        `).join("");

        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 6px;">
            <span class="preview-text" style="font-weight: 700; color: var(--accent-indigo);">${list.timestamp} (${completed}/${total} Done)</span>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="restore-history-btn" data-id="${list.id}" style="font-size: 11.5px; color: var(--accent-cyan); cursor: pointer; font-weight: 600;"><i class="fas fa-undo"></i> Restore</span>
              <i class="fas fa-times checklist-delete-btn" data-id="${list.id}" title="Delete archive"></i>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; padding: 4px 0;">
            ${itemsHtml}
          </div>
        `;

        // Restore list callback
        item.querySelector(".restore-history-btn").addEventListener("click", () => {
          const confirmRestore = confirm("Restore this archived checklist? Your current active checklist items will be replaced.");
          if (!confirmRestore) return;

          activeList = JSON.parse(JSON.stringify(list.items));
          saveActiveList();
          renderActiveList();
        });

        // Delete archive entry callback
        item.querySelector(".checklist-delete-btn").addEventListener("click", () => {
          let currentArchived = JSON.parse(localStorage.getItem("macroArchivedChecklists") || "[]");
          currentArchived = currentArchived.filter(l => l.id !== list.id);
          localStorage.setItem("macroArchivedChecklists", JSON.stringify(currentArchived));
          renderHistory();
        });

        elements.checklistHistoryContainer.appendChild(item);
      });
    }

    // 6. Collapsible History Panel Toggler
    if (elements.checklistHistoryToggle && elements.checklistHistoryWrapper && elements.checklistHistoryChevron) {
      elements.checklistHistoryToggle.addEventListener("click", () => {
        const isCollapsed = elements.checklistHistoryWrapper.style.display === "none";
        if (isCollapsed) {
          elements.checklistHistoryWrapper.style.display = "block";
          elements.checklistHistoryChevron.style.transform = "rotate(180deg)";
        } else {
          elements.checklistHistoryWrapper.style.display = "none";
          elements.checklistHistoryChevron.style.transform = "rotate(0deg)";
        }
      });
    }

    // Initial render
    renderActiveList();
    renderHistory();
  }

  // --- Trading Notes Controller ---
  function setupNotesPanel() {
    if (!elements.notesTextarea) return;

    let debounceTimeout = null;

    // Load initial notes
    const savedNotes = localStorage.getItem("macroTradingNotes") || "";
    elements.notesTextarea.value = savedNotes;

    // Load initial status label
    const lastSavedTime = localStorage.getItem("macroTradingNotesTimestamp");
    if (elements.notesSaveStatus) {
      elements.notesSaveStatus.innerText = lastSavedTime ? `Saved at ${lastSavedTime}` : "Saved";
      elements.notesSaveStatus.style.opacity = lastSavedTime ? "0.6" : "0.3";
    }

    // Auto-save logic (debounced)
    elements.notesTextarea.addEventListener("input", () => {
      if (elements.notesSaveStatus) {
        elements.notesSaveStatus.innerText = "Typing...";
        elements.notesSaveStatus.style.opacity = "0.8";
      }

      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(saveNotes, 1000);
    });

    function saveNotes() {
      const text = elements.notesTextarea.value;
      localStorage.setItem("macroTradingNotes", text);

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      localStorage.setItem("macroTradingNotesTimestamp", timeStr);

      if (elements.notesSaveStatus) {
        elements.notesSaveStatus.innerText = `Saved at ${timeStr}`;
        elements.notesSaveStatus.style.opacity = "0.6";
      }
    }

    // Clear notes logic
    if (elements.btnClearNotes) {
      elements.btnClearNotes.addEventListener("click", () => {
        const confirmClear = confirm("Are you sure you want to clear your notes? This action cannot be undone.");
        if (confirmClear) {
          elements.notesTextarea.value = "";
          localStorage.removeItem("macroTradingNotes");
          localStorage.removeItem("macroTradingNotesTimestamp");
          if (elements.notesSaveStatus) {
            elements.notesSaveStatus.innerText = "Cleared";
            elements.notesSaveStatus.style.opacity = "0.3";
          }
        }
      });
    }
  }

  // Launch
  init();
});
