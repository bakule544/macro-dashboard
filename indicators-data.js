// Database of the 36 major economic indicators mapped to FRED Series IDs
const INDICATORS = [
  // --- Monetary Policy ---
  {
    name: "Interest Rate Decision (FOMC / CBs)",
    code: "interest_rate",
    category: "Monetary Policy",
    fredId: "FEDFUNDS",
    fredUnits: "lin",
    frequency: "8 times per year (approx. every 6 weeks)",
    source: "Institutional Feed",
    impact: "High",
    unit: "%",
    trend: "higher_restrictive",
    description: "The Federal Open Market Committee (FOMC) sets the target range for the federal funds rate, which is the interest rate at which depository institutions lend reserve balances to other depository institutions overnight. This decision is the single most powerful tool of US monetary policy, directly influencing borrowing costs for consumers and businesses, asset prices, and the value of the US Dollar."
  },
  {
    name: "FOMC Minutes & Dot Plot",
    code: "fomc_minutes",
    category: "Monetary Policy",
    fredId: "FEDFUNDS",
    fredUnits: "lin",
    frequency: "Minutes 3 weeks after meeting; Dot Plot quarterly",
    source: "Institutional Feed",
    impact: "High",
    unit: "% (Projections)",
    trend: "hawkish_dovish",
    description: "The FOMC Minutes provide detailed insights into the discussions, debates, and policy leanings of Fed officials during their monetary policy meetings. The quarterly 'Dot Plot' shows individual FOMC member projections for future interest rates over the next several years, offering critical forward guidance to financial markets regarding the Fed's future path."
  },
  {
    name: "Fed Balance Sheet / WALCL",
    code: "fed_balance_sheet",
    category: "Monetary Policy",
    fredId: "WALCL",
    fredUnits: "lin",
    frequency: "Weekly (Every Thursday)",
    source: "Institutional Feed",
    impact: "High",
    unit: "Billions of USD",
    trend: "neutral",
    description: "Federal Reserve Total Assets (Balance Sheet). Quantitative Easing (QE) expands the balance sheet by purchasing assets to inject liquidity, while Quantitative Tightening (QT) shrinks the balance sheet to withdraw liquidity from the financial system."
  },

  // --- Inflation ---
  {
    name: "Consumer Price Index (CPI)",
    code: "cpi",
    category: "Inflation",
    fredId: "CPIAUCSL",
    fredUnits: "pc1", // Percent Change from Year Ago (YoY)
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "High",
    unit: "% YoY",
    trend: "lower_bullish",
    description: "The Consumer Price Index (CPI) measures the average change over time in the prices paid by urban consumers for a market basket of consumer goods and services. It is the most widely watched measure of inflation in the US economy. High CPI figures prompt central banks to raise interest rates, while falling CPI figures open the door to rate cuts."
  },
  {
    name: "Core PCE Price Index",
    code: "core_pce",
    category: "Inflation",
    fredId: "PCEPILFE",
    fredUnits: "pc1", // Percent Change from Year Ago (YoY)
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "High",
    unit: "% YoY",
    trend: "lower_bullish",
    description: "The Personal Consumption Expenditures (PCE) price index excluding food and energy is the Federal Reserve's preferred gauge of inflation. It measures price changes in goods and services purchased by consumers, but excludes volatile food and energy costs to isolate underlying inflation trends, which the Fed uses to gauge policy effectiveness."
  },
  {
    name: "Producer Price Index (PPI)",
    code: "ppi",
    category: "Inflation",
    fredId: "PPIACO",
    fredUnits: "pc1", // Percent Change from Year Ago (YoY)
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "% YoY",
    trend: "lower_bullish",
    description: "The Producer Price Index (PPI) measures the average change over time in the selling prices received by domestic producers for their output. Because it tracks costs at the wholesale/manufacturing level, it serves as a leading indicator for CPI, as wholesale price changes are eventually passed down to the consumer."
  },
  {
    name: "Michigan Inflation Expectations",
    code: "michigan_inf_exp",
    category: "Inflation",
    fredId: "MICH",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "%",
    trend: "lower_bullish",
    description: "Released as part of the Consumer Sentiment Index, this metric measures consumer expectations for inflation over the next 12 months. Central banks watch this closely because 'anchored' inflation expectations are vital; if consumers expect high inflation, they demand higher wages, creating a self-fulfilling price-wage spiral."
  },

  // --- Labour Market ---
  {
    name: "Non-Farm Payrolls (NFP)",
    code: "nfp",
    category: "Labour Market",
    fredId: "PAYEMS",
    fredUnits: "chg", // Monthly Change (t - t-1)
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "High",
    unit: "Change in Thousands",
    trend: "higher_bullish",
    description: "Non-Farm Payrolls measures the net change in the number of paid employees in the United States, excluding agricultural workers, private household employees, non-profit organizations, and government workers. It is considered the most critical monthly employment report, reflecting the core health of the US economic expansion."
  },
  {
    name: "Average Hourly Earnings",
    code: "hourly_earnings",
    category: "Labour Market",
    fredId: "CES0500000003",
    fredUnits: "pc1", // Percent Change from Year Ago (YoY)
    frequency: "Monthly (released with NFP)",
    source: "Institutional Feed",
    impact: "High",
    unit: "% YoY",
    trend: "moderate_bullish",
    description: "Average Hourly Earnings measures the change in the price businesses pay for labor, excluding the agricultural industry. Wage inflation is a major component of overall services inflation; rapid wage growth is positive for consumer spending but can force central banks to keep interest rates high to cool the economy."
  },
  {
    name: "Unemployment Rate",
    code: "unemployment_rate",
    category: "Labour Market",
    fredId: "UNRATE",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "High",
    unit: "%",
    trend: "lower_bullish",
    description: "The Unemployment Rate measures the number of unemployed people actively looking for work as a percentage of the labor force. A low unemployment rate points to a strong consumer and economic growth, but an extremely tight labor market can lead to labor shortages and rising wage-push inflation."
  },
  {
    name: "Initial Jobless Claims",
    code: "initial_claims",
    category: "Labour Market",
    fredId: "ICSA",
    fredUnits: "lin",
    frequency: "Weekly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Thousands",
    trend: "lower_bullish",
    description: "Initial Jobless Claims measures the number of individuals filing for state unemployment benefits for the first time. As a weekly indicator, it offers a real-time pulse of the labor market, with sudden increases serving as a reliable early warning sign of economic stress or an impending recession."
  },
  {
    name: "Continuing Jobless Claims",
    code: "continuing_claims",
    category: "Labour Market",
    fredId: "CCSA",
    fredUnits: "lin",
    frequency: "Weekly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Thousands",
    trend: "lower_bullish",
    description: "Continuing Jobless Claims measures the number of individuals who are receiving ongoing unemployment benefits. While initial claims measure layoffs, continuing claims indicate how difficult it is for unemployed workers to find new employment, reflecting underlying structural labor market demand."
  },
  {
    name: "JOLTS Job Openings",
    code: "jolts_openings",
    category: "Labour Market",
    fredId: "JTSJOL",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Millions",
    trend: "higher_bullish",
    description: "The Job Openings and Labor Turnover Survey (JOLTS) reports on job openings, hires, and separations (quits/layoffs). A high number of open, unfilled positions indicates strong employer demand, while high 'quits' rates signal worker confidence in finding new, higher-paying jobs."
  },
  {
    name: "ADP Employment Change",
    code: "adp_employment",
    category: "Labour Market",
    fredId: "ADPMNUSNERSA",
    fredUnits: "chg",
    frequency: "Monthly (released 2 days before NFP)",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Change in Thousands",
    trend: "higher_bullish",
    description: "The ADP National Employment Report measures the monthly change in non-farm private employment based on payroll data from approximately 400,000 US business clients. While not always perfectly aligned with the official government NFP report, it acts as a major precursor and market sentiment setter."
  },
  {
    name: "Employment Cost Index (ECI)",
    code: "eci",
    category: "Labour Market",
    fredId: "ECIALLCIV",
    fredUnits: "pch", // Percent Change (QoQ Headline)
    frequency: "Quarterly",
    source: "Institutional Feed",
    impact: "High",
    unit: "% QoQ",
    trend: "lower_bullish",
    description: "The Employment Cost Index (ECI) measures changes in the cost of labor, including wages, salaries, and employer-paid benefits. Because it adjusts for shifts in employment mix across occupations, it is considered the most comprehensive and pure measure of labor cost inflation."
  },

  // --- Growth & Output ---
  {
    name: "Gross Domestic Product (GDP)",
    code: "gdp",
    category: "Growth & Output",
    fredId: "A191RL1Q225SBEA", // Real GDP % Change Preceding Period Annualized
    fredUnits: "lin",
    frequency: "Quarterly",
    source: "Institutional Feed",
    impact: "High",
    unit: "% QoQ Annualized",
    trend: "higher_bullish",
    description: "Gross Domestic Product represents the total monetary value of all finished goods and services produced within the United States. It is the broadest measure of aggregate economic activity, indicating whether the economy is expanding, stagnant, or in a recessionary contraction."
  },
  {
    name: "Industrial Production",
    code: "industrial_prod",
    category: "Growth & Output",
    fredId: "INDPRO",
    fredUnits: "pch", // Percent Change (MoM)
    frequency: "Monthly",
    source: "Federal Reserve Board",
    impact: "Medium",
    unit: "% MoM",
    trend: "higher_bullish",
    description: "Industrial Production measures the real output of manufacturing, mining, and electric and gas utilities. It is highly sensitive to interest rates and consumer demand, making it a key coincident indicator of the physical manufacturing cycle."
  },
  {
    name: "Capacity Utilization",
    code: "capacity_utilization",
    category: "Growth & Output",
    fredId: "TCU",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Federal Reserve Board",
    impact: "Medium",
    unit: "%",
    trend: "higher_bullish",
    description: "Capacity Utilization measures the percentage of capital resources (factories, equipment, mines) that are actively utilized to produce goods. Rates above 80% indicate high demand and can signal supply chain pressures, leading to price hikes."
  },
  {
    name: "Durable Goods Orders",
    code: "durable_goods",
    category: "Growth & Output",
    fredId: "DGORDER",
    fredUnits: "pch", // Percent Change (MoM)
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "% MoM",
    trend: "higher_bullish",
    description: "Durable Goods Orders measures new orders placed with domestic manufacturers for long-lasting capital and consumer goods (e.g., planes, computers, machinery). It serves as a leading indicator of manufacturing activity, capital expenditures, and business investment trends."
  },
  {
    name: "ISM Manufacturing Index",
    code: "ism_mfg",
    category: "Growth & Output",
    fredId: "CFSBCACTIVITYMFG",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "High",
    unit: "Index",
    trend: "higher_bullish",
    description: "This Chicago Fed manufacturing activity index is used as a current FRED-backed proxy for manufacturing survey momentum. Higher readings indicate stronger manufacturing conditions and can provide an early signal for broader industrial activity."
  },
  {
    name: "ISM Services Index",
    code: "ism_services",
    category: "Growth & Output",
    fredId: "CFSBCACTIVITYNMFG",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "High",
    unit: "Index",
    trend: "higher_bullish",
    description: "This Chicago Fed nonmanufacturing activity index is used as a current FRED-backed proxy for service-sector momentum. It helps track broad business activity outside manufacturing."
  },
  {
    name: "Flash PMI",
    code: "flash_pmi",
    category: "Growth & Output",
    fredId: "BBKMCY",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Annualized % Change",
    trend: "higher_bullish",
    description: "The Brave-Butters-Kelley monthly growth cycle index is used as a current FRED-backed proxy for near-term economic momentum. Higher values indicate stronger cyclical growth conditions."
  },

  // --- Consumer ---
  {
    name: "Retail Sales",
    code: "retail_sales",
    category: "Consumer",
    fredId: "RSAFS",
    fredUnits: "pch", // Percent Change MoM
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "High",
    unit: "% MoM",
    trend: "higher_bullish",
    description: "Retail Sales measures the total receipts of retail stores, tracking consumer spending on tangible goods (such as vehicles, food, clothing, and furniture). Since consumer spending represents nearly 70% of the US economy, this is a major coincident indicator of overall growth."
  },
  {
    name: "Personal Income & Spending",
    code: "personal_income",
    category: "Consumer",
    fredId: "PCE", // Personal Consumption Expenditures Spending
    fredUnits: "pch", // Percent Change MoM
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "% MoM",
    trend: "higher_bullish",
    description: "This report measures the total income received by individuals from all sources (wages, government benefits, investments) alongside their personal consumption expenditures (spending on goods and services). It provides an essential look at consumer financial margins and savings rates."
  },
  {
    name: "Michigan Consumer Sentiment",
    code: "consumer_sentiment_um",
    category: "Consumer",
    fredId: "UMCSENT",
    fredUnits: "lin",
    frequency: "Monthly (preliminary and final)",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Index",
    trend: "higher_bullish",
    description: "The University of Michigan Consumer Sentiment Index measures consumer attitudes toward their personal finances, the near-term business environment, and long-term economic prospects. High consumer optimism is a strong precursor to robust consumer spending."
  },
  {
    name: "Consumer Confidence Index (CCI)",
    code: "consumer_confidence_cb",
    category: "Consumer",
    fredId: "UMCSENT", // Map to UMCSENT proxy
    fredUnits: "lin",
    frequency: "Monthly (last Tuesday)",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Index",
    trend: "higher_bullish",
    description: "The Conference Board's Consumer Confidence Index assesses public perceptions of current business and employment conditions, alongside future expectations. Unlike the Michigan index (which focuses more on personal financial buying conditions), this index weights labor market perceptions heavily."
  },

  // --- Housing ---
  {
    name: "Building Permits & Housing Starts",
    code: "building_permits",
    category: "Housing",
    fredId: "PERMIT",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Annualized Rate in Millions",
    trend: "higher_bullish",
    description: "Building Permits measure the number of government authorizations granted for new residential construction. Housing Starts measure the actual initiation of construction on new homes. Because building a home involves significant capital, hiring, and material ordering, these are classic leading indicators of real economic growth."
  },
  {
    name: "Existing Home Sales",
    code: "existing_home_sales",
    category: "Housing",
    fredId: "EXHOSLUSM495S",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Annualized Rate in Millions",
    trend: "higher_bullish",
    description: "Existing Home Sales tracks closed sales of previously constructed single-family homes, townhomes, and condominiums. It represents about 90% of the US residential housing transaction volume. High sales volume indicates a robust economy, low borrowing rates, and drives consumer spending on household furnishings."
  },
  {
    name: "Pending Home Sales",
    code: "pending_home_sales",
    category: "Housing",
    fredId: "EXHOSLUSM495S", // Proxy
    fredUnits: "pch", // Percent Change MoM
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "% MoM",
    trend: "higher_bullish",
    description: "Pending Home Sales measures housing contracts that have been signed but have not yet reached final settlement/closing (typically occurring 1-2 months later). It is a leading indicator for Existing Home Sales and helps economists forecast short-term housing demand."
  },
  {
    name: "New Home Sales",
    code: "new_home_sales",
    category: "Housing",
    fredId: "HSN1F",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Annualized Rate in Thousands",
    trend: "higher_bullish",
    description: "New Home Sales tracks signed purchase agreements for newly constructed residential homes. While representing only 10% of total housing transactions, it represents a direct injection into GDP (construction materials, wages, new appliances) and is considered a sensitive leading indicator of housing demand."
  },
  {
    name: "Case-Shiller Home Price Index",
    code: "case_shiller",
    category: "Housing",
    fredId: "CSUSHPISA",
    fredUnits: "pc1", // Percent Change from Year Ago (YoY)
    frequency: "Monthly (last Tuesday, 2-month lag)",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "% YoY",
    trend: "higher_wealth_effect",
    description: "The S&P/Case-Shiller U.S. National Home Price Index measures changes in the value of the residential housing market in 20 key metro areas. Rising home values increase home equity, fostering consumer 'wealth effects' that stimulate wider consumer spending, while rapid drops can trigger financial distress."
  },

  // --- Trade & Fiscal ---
  {
    name: "Trade Balance",
    code: "trade_balance",
    category: "Trade & Fiscal",
    fredId: "BOPGSTB",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Low",
    unit: "Millions of $ (Deficit)",
    trend: "narrowing_deficit_bullish",
    description: "The Trade Balance measures the difference in value between exported and imported goods and services. A trade deficit (negative value) means the US imports more than it exports, which subtracts from the net GDP calculation, though it also reflects strong domestic consumer demand."
  },
  {
    name: "Government Budget Balance",
    code: "budget_balance",
    category: "Trade & Fiscal",
    fredId: "MTSDS133FMS",
    fredUnits: "lin",
    frequency: "Monthly / Annual",
    source: "Institutional Feed",
    impact: "Low",
    unit: "Millions of $ (Deficit)",
    trend: "lower_deficit_neutral",
    description: "The Government Budget Balance measures the difference between government tax revenues and expenditures. A federal budget deficit (negative value) requires the Treasury to issue new debt (bonds), impacting global interest rates, liquidity, and fiscal sustainability assessments."
  },

  // --- Forward-Looking ---
  {
    name: "Philly Fed Manufacturing Index",
    code: "philly_fed",
    category: "Forward-Looking",
    fredId: "GACDFSA066MSFRBPHI",
    fredUnits: "lin",
    frequency: "Monthly (third Thursday)",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Index (0 = Neutral)",
    trend: "higher_bullish",
    description: "The Philly Fed Business Outlook Survey measures manufacturing conditions in the Third Federal Reserve District (Pennsylvania, New Jersey, Delaware). As one of the earliest regional manufacturing indicators released each month, it is closely watched to forecast national ISM indexes."
  },
  {
    name: "Empire State Manufacturing Index",
    code: "empire_state",
    category: "Forward-Looking",
    fredId: "GACDISA066MSFRBNY",
    fredUnits: "lin",
    frequency: "Monthly (approx. 15th)",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Index (0 = Neutral)",
    trend: "higher_bullish",
    description: "The Empire State Manufacturing Survey measures business conditions in New York State. Like the Philly Fed index, it is highly volatile and serves as an early leading indicator of overall US industrial activity."
  },
  {
    name: "Conference Board LEI",
    code: "cb_lei",
    category: "Forward-Looking",
    fredId: "BBKMLEIX",
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "High",
    unit: "Standard Deviations",
    trend: "higher_bullish",
    description: "The Brave-Butters-Kelley Leading Index summarizes leading economic conditions in standard-deviation units. It is used here because the old FRED leading-index proxy is discontinued and no longer updates."
  },
  {
    name: "CB Consumer Expectations",
    code: "consumer_expectations_cb",
    category: "Forward-Looking",
    fredId: "UMCSENT", // Map to UMCSENT proxy
    fredUnits: "lin",
    frequency: "Monthly",
    source: "Institutional Feed",
    impact: "Medium",
    unit: "Index",
    trend: "higher_bullish",
    description: "A subset of the Conference Board's Consumer Confidence Index, this focuses specifically on consumers' outlook for business conditions, employment, and income over the next six months. Readings below 80 are historically associated with an impending recession."
  }
];

// Export for browser import
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { INDICATORS };
} else {
  window.INDICATORS = INDICATORS;
}
