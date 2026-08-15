// Chart helper module for Macro Economic Dashboard
let dashboardChartInstance = null;

const tradingViewCrosshairPlugin = {
  id: 'tradingViewCrosshair',
  afterInit: (chart) => {
    chart.$crosshair = { x: null, y: null };
    chart.canvas.$chartInstance = chart;

    if (chart.canvas.$hasCrosshairListeners) return;
    chart.canvas.$hasCrosshairListeners = true;

    chart.canvas.addEventListener('mousemove', (e) => {
      const currentChart = e.currentTarget.$chartInstance;
      if (!currentChart) return;

      const rect = currentChart.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x >= currentChart.chartArea.left && x <= currentChart.chartArea.right &&
          y >= currentChart.chartArea.top && y <= currentChart.chartArea.bottom) {
        currentChart.$crosshair.x = x;
        currentChart.$crosshair.y = y;
      } else {
        currentChart.$crosshair.x = null;
        currentChart.$crosshair.y = null;
      }
      currentChart.draw();
    });

    chart.canvas.addEventListener('mouseleave', (e) => {
      const currentChart = e.currentTarget.$chartInstance;
      if (!currentChart) return;
      currentChart.$crosshair.x = null;
      currentChart.$crosshair.y = null;
      currentChart.draw();
    });
  },
  afterDraw: (chart) => {
    const x = chart.$crosshair?.x;
    const y = chart.$crosshair?.y;

    if (x === null || y === null || x === undefined || y === undefined) return;

    const ctx = chart.ctx;
    const topY = chart.chartArea.top;
    const bottomY = chart.chartArea.bottom;
    const leftX = chart.chartArea.left;
    const rightX = chart.chartArea.right;

    // Convert mouse X to nearest category index
    const index = chart.scales.x.getValueForPixel(x);
    if (index < 0 || index >= chart.data.labels.length) return;

    const gridX = chart.scales.x.getPixelForValue(index);

    ctx.save();

    // 1. Draw Vertical Line (Dashed) snapped to grid index
    ctx.beginPath();
    ctx.moveTo(gridX, topY);
    ctx.lineTo(gridX, bottomY);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.setLineDash([3, 3]);
    ctx.stroke();

    // 2. Draw Horizontal Line (Dashed) at exact mouse Y
    ctx.beginPath();
    ctx.moveTo(leftX, y);
    ctx.lineTo(rightX, y);
    ctx.stroke();

    // 3. Draw X-Axis Date Pill
    const dateText = chart.data.labels[index] || "";
    ctx.font = '10px Inter, sans-serif';
    const xTextWidth = ctx.measureText(dateText).width;
    const xPillWidth = xTextWidth + 12;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(gridX - xPillWidth / 2, bottomY + 2, xPillWidth, 18, 4);
    } else {
      ctx.rect(gridX - xPillWidth / 2, bottomY + 2, xPillWidth, 18);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dateText, gridX, bottomY + 11);

    // 4. Draw Y-Axis Value Pill at exact mouse Y
    const val = chart.scales.y.getValueForPixel(y);
    let valText = val !== undefined ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "";

    if (chart.options.scales.y.ticks && chart.options.scales.y.ticks.callback) {
      const formatted = chart.options.scales.y.ticks.callback(val);
      if (formatted !== undefined) valText = formatted;
    }

    const yTextWidth = ctx.measureText(valText).width;
    const yPillWidth = yTextWidth + 10;

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(leftX - yPillWidth - 4, y - 9, yPillWidth, 18, 4);
    } else {
      ctx.rect(leftX - yPillWidth - 4, y - 9, yPillWidth, 18);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(valText, leftX - yPillWidth / 2 - 4, y);

    // 5. Draw Right Y-Axis (y1) Value Pill if it exists (e.g. for Open Interest)
    if (chart.scales.y1) {
      const val1 = chart.scales.y1.getValueForPixel(y);
      let valText1 = val1 !== undefined ? val1.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

      if (chart.options.scales.y1.ticks && chart.options.scales.y1.ticks.callback) {
        const formatted = chart.options.scales.y1.ticks.callback(val1);
        if (formatted !== undefined) valText1 = formatted;
      }

      const yTextWidth1 = ctx.measureText(valText1).width;
      const yPillWidth1 = yTextWidth1 + 10;

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rightX + 4, y - 9, yPillWidth1, 18, 4);
      } else {
        ctx.rect(rightX + 4, y - 9, yPillWidth1, 18);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(valText1, rightX + yPillWidth1 / 2 + 4, y);
    }

    ctx.restore();
  }
};

/**
 * Renders or updates a chart using Chart.js.
 * @param {string} canvasId - The ID of the canvas element
 * @param {Object} indicator - The indicator metadata object
 * @param {Array} dataPoints - Array of {date, value} objects
 * @param {boolean} isLive - Whether this is live FRED data
 */
/**
 * Formats a value according to the indicator unit.
 */
function formatValueByUnit(val, unit = "") {
  if (val === undefined || val === null) return "";
  if (unit.includes('%')) {
    return val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%';
  } else if (unit.includes('Millions')) {
    return val.toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'M';
  } else if (unit.includes('Thousands')) {
    return val.toLocaleString(undefined, { maximumFractionDigits: 0 }) + 'k';
  } else if (unit.includes('Billions')) {
    return (val < 0 ? '-' : '') + '$' + Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'B';
  }
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Renders or updates a chart using Chart.js.
 * @param {string} canvasId - The ID of the canvas element
 * @param {Object} indicator - The indicator metadata object
 * @param {Array} dataPoints - Array of {date, value} objects
 * @param {boolean} isLive - Whether this is live FRED data
 * @param {Object} secondIndicator - The secondary indicator metadata for comparison
 * @param {Array} secondDataPoints - The aligned secondary data points
 * @param {boolean} showSma - Whether to render a 3-period simple moving average
 */
function renderEconomicChart(canvasId, indicator, dataPoints, isLive = false, secondIndicator = null, secondDataPoints = null, showSma = false) {
  window.renderEconomicChart = renderEconomicChart;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  
  // Clean up any existing chart
  if (dashboardChartInstance) {
    dashboardChartInstance.destroy();
  }

  // Extract labels and values
  const labels = dataPoints.map(d => d.date);
  const values = dataPoints.map(d => d.value);

  // Determine chart type based on indicators (deficits are better as bar charts)
  // We disable bar chart style during comparison mode for clean line overlays
  const isBarChart = !secondIndicator && (indicator.code === 'budget_balance' || indicator.code === 'trade_balance');
  const chartType = isBarChart ? 'bar' : 'line';

  // Create styling gradients
  let strokeColor = '#818cf8'; // Neon Indigo
  let fillGradient = null;
  let borderGradient = null;

  if (!isBarChart) {
    const cWidth = canvas.width || canvas.clientWidth || 800;
    const cHeight = canvas.height || canvas.clientHeight || 400;
    try {
      borderGradient = ctx.createLinearGradient(0, 0, cWidth, 0);
      borderGradient.addColorStop(0, '#818cf8'); // Neon Indigo
      borderGradient.addColorStop(0.5, '#c084fc'); // Violet
      borderGradient.addColorStop(1, '#6366f1'); // Cyan

      fillGradient = ctx.createLinearGradient(0, 0, 0, cHeight);
      fillGradient.addColorStop(0, 'rgba(129, 140, 248, 0.25)');
      fillGradient.addColorStop(0.5, 'rgba(192, 132, 252, 0.08)');
      fillGradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    } catch (e) {
      borderGradient = strokeColor;
      fillGradient = 'rgba(129, 140, 248, 0.15)';
    }
  }

  const datasets = [];

  // 1. Primary Dataset
  datasets.push({
    label: indicator.name,
    data: values,
    borderColor: borderGradient || strokeColor,
    borderWidth: 3,
    pointBackgroundColor: '#fff',
    pointBorderColor: '#818cf8',
    pointBorderWidth: 2,
    pointRadius: dataPoints.length > 50 ? 0 : 4,
    pointHoverRadius: 7,
    pointHoverBackgroundColor: '#22d3ee',
    pointHoverBorderColor: '#fff',
    pointHoverBorderWidth: 2,
    fill: !isBarChart,
    backgroundColor: isBarChart ? (context) => {
      const val = context.raw;
      return val >= 0 ? 'rgba(52, 211, 153, 0.75)' : 'rgba(248, 113, 113, 0.75)'; // green vs red
    } : fillGradient,
    borderRadius: isBarChart ? 4 : 0,
    yAxisID: 'y'
  });

  // 2. SMA Overlay (on primary dataset Y-axis)
  if (showSma && values.length > 0) {
    const smaValues = [];
    const period = 3;
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) {
        smaValues.push(null); // Not enough data points
      } else {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += values[i - j];
        }
        smaValues.push(parseFloat((sum / period).toFixed(3)));
      }
    }
    datasets.push({
      label: `${indicator.name} (${period}-Per SMA)`,
      data: smaValues,
      borderColor: '#c084fc', // Neon Violet
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
      yAxisID: 'y',
      spanGaps: true
    });
  }

  // 3. Comparison Dataset (on secondary Y-axis 'y1')
  if (secondIndicator && secondDataPoints) {
    const secondValues = secondDataPoints.map(d => d.value);
    datasets.push({
      label: secondIndicator.name,
      data: secondValues,
      borderColor: '#06b6d4', // Cyan
      borderWidth: 3,
      pointBackgroundColor: '#fff',
      pointBorderColor: '#06b6d4',
      pointBorderWidth: 2,
      pointRadius: secondDataPoints.length > 50 ? 0 : 4,
      pointHoverRadius: 7,
      pointHoverBackgroundColor: '#06b6d4',
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
      fill: false,
      yAxisID: 'y1'
    });
  }

  // Configuration object
  const config = {
    type: chartType,
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: secondIndicator || showSma,
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter, system-ui, sans-serif', size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)', // Slate 950
          titleColor: '#cbd5e1',
          bodyColor: '#f8fafc',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: true,
          font: {
            family: 'Inter, system-ui, sans-serif'
          },
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const val = context.raw;
              if (val === null || val === undefined) return null;
              
              let unit = indicator ? indicator.unit : "";
              if (secondIndicator && context.datasetIndex === datasets.length - 1 && !context.dataset.label.includes('SMA')) {
                unit = secondIndicator.unit;
              }
              return `${label}: ${formatValueByUnit(val, unit)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            color: '#94a3b8', // Slate 400
            font: {
              family: 'Inter, system-ui, sans-serif',
              size: 10
            },
            maxRotation: 45,
            minRotation: 45
          }
        },
        y: {
          position: 'left',
          grid: {
            color: 'rgba(255, 255, 255, 0.06)',
            drawBorder: false
          },
          ticks: {
            color: '#94a3b8',
            font: {
              family: 'Inter, system-ui, sans-serif',
              size: 10
            },
            callback: function(value) {
              return formatValueByUnit(value, indicator.unit);
            }
          },
          title: {
            display: true,
            text: indicator.unit,
            color: '#94a3b8',
            font: { size: 10 }
          }
        },
        ...(secondIndicator ? {
          y1: {
            position: 'right',
            grid: {
              drawOnChartArea: false,
              drawBorder: false
            },
            ticks: {
              color: '#06b6d4',
              font: {
                family: 'Inter, system-ui, sans-serif',
                size: 10
              },
              callback: function(value) {
                return formatValueByUnit(value, secondIndicator.unit);
              }
            },
            title: {
              display: true,
              text: secondIndicator.unit,
              color: '#06b6d4',
              font: { size: 10 }
            }
          }
        } : {})
      },
      interaction: {
        mode: 'index',
        intersect: false
      }
    },
    plugins: [tradingViewCrosshairPlugin]
  };

  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';

  dashboardChartInstance = new Chart(ctx, config);
  return dashboardChartInstance;
}

let cotChartInstance = null;

function renderCotChart(canvasId, marketName, dataPoints) {
  window.renderCotChart = renderCotChart;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  
  if (cotChartInstance) {
    cotChartInstance.destroy();
  }

  const labels = dataPoints.map(d => d.date);
  const specNet = dataPoints.map(d => d.nonCommNet);
  const commNet = dataPoints.map(d => d.commNet);
  const openInterest = dataPoints.map(d => d.oi);

  const config = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Speculators (Non-Commercial Net)',
          data: specNet,
          borderColor: '#60a5fa', // Light Blue
          borderWidth: 3.5,
          pointRadius: 3,
          pointBackgroundColor: '#60a5fa',
          fill: false,
          yAxisID: 'y'
        },
        {
          label: 'Commercial Hedgers Net',
          data: commNet,
          borderColor: '#f472b6', // Light Pink
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 2,
          pointBackgroundColor: '#f472b6',
          fill: false,
          yAxisID: 'y'
        },
        {
          label: 'Open Interest',
          data: openInterest,
          borderColor: 'rgba(148, 163, 184, 0.3)', // Semi-transparent Slate
          borderWidth: 1.5,
          backgroundColor: 'rgba(148, 163, 184, 0.05)',
          fill: true,
          pointRadius: 0,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#cbd5e1',
            font: { family: 'Inter, system-ui, sans-serif', size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#f8fafc',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          font: { family: 'Inter, system-ui, sans-serif' }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Inter, system-ui, sans-serif', size: 10 }, maxRotation: 45 }
        },
        y: {
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: {
            color: '#94a3b8',
            font: { family: 'Inter, system-ui, sans-serif', size: 10 },
            callback: function(value) {
              return (value < 0 ? '-' : '') + Math.abs(value).toLocaleString();
            }
          },
          title: { display: true, text: 'Net Position (Contracts)', color: '#94a3b8', font: { size: 10 } }
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false }, // Only show grid lines for left axis
          ticks: {
            color: 'rgba(148, 163, 184, 0.7)',
            font: { family: 'Inter, system-ui, sans-serif', size: 9 },
            callback: function(value) {
              return value.toLocaleString();
            }
          },
          title: { display: true, text: 'Open Interest', color: 'rgba(148, 163, 184, 0.7)', font: { size: 10 } }
        }
      }
    },
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: [tradingViewCrosshairPlugin]
  };

  cotChartInstance = new Chart(ctx, config);
  return cotChartInstance;
}

// Window Resize Compatibility Listener for Charts
let chartResizeDebounce;
window.addEventListener('resize', () => {
  clearTimeout(chartResizeDebounce);
  chartResizeDebounce = setTimeout(() => {
    if (dashboardChartInstance) {
      dashboardChartInstance.resize();
    }
    if (typeof cotChartInstance !== 'undefined' && cotChartInstance) {
      cotChartInstance.resize();
    }
  }, 100);
});

// Unconditional global assignments for browser usage
window.renderEconomicChart = renderEconomicChart;
window.renderCotChart = renderCotChart;

// Export for module bundlers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderEconomicChart, renderCotChart };
}

