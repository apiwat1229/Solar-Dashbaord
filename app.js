const { createApp, ref, onMounted, computed, watch, nextTick } = Vue;

createApp({
    setup() {
        const activeTab = ref('dashboard');
        const connectionStatus = ref('online');

        const overview = ref({});
        const powerFlow = ref({});
        const envBenefits = ref({});
        const inventory = ref({ inverters: [] });
        const chartDays = ref(1);
        const selectedDate = ref(new Date().toISOString().split('T')[0]);
        const formatTimestamp = () => {
            const now = new Date();
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const day = String(now.getDate()).padStart(2, '0');
            const month = months[now.getMonth()];
            const year = now.getFullYear();
            const time = now.toTimeString().split(' ')[0];
            return `${day}-${month}-${year} | ${time}`;
        };
        const lastUpdateTime = ref(formatTimestamp());

        const formattedSelectedDate = computed(() => {
            if (!selectedDate.value) return '';
            const date = new Date(selectedDate.value);
            const day = String(date.getDate()).padStart(2, '0');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        });

        watch(selectedDate, () => {
            loadDashboardData();
        });


        const connectionStatusText = computed(() => {
            return connectionStatus.value === 'online' ? 'Online' : 'Offline';
        });

        const inverterStatusSummary = computed(() => {
            const inverters = inventory.value.inverters || [];
            const online = inverters.filter(i => i.status === 1 || i.status === '1').length;
            return `${online}/${inverters.length}`;
        });

        const flowSpeeds = computed(() => {
            const getSpeed = (val) => {
                if (!val || val <= 0) return '0s';
                // Higher power = faster animation (lower duration)
                // Range: 0.5s (high power) to 5s (low power)
                const duration = Math.max(0.5, Math.min(5, 10 / (val / 1000 + 0.1)));
                return `${duration.toFixed(2)}s`;
            };

            return {
                solar: getSpeed(powerFlow.value.pv?.currentPower),
                grid: getSpeed(powerFlow.value.grid?.currentPower),
                load: getSpeed(powerFlow.value.load?.currentPower),
                ups: '3s', // Static or based on value if available
                battery: '0s'
            };
        });

        const formatPower = (val, unit = 'W') => {
            if (val === undefined || val === null) return '0 kW';
            let kw = unit && unit.toLowerCase() === 'kw' ? val : val / 1000;
            return `${kw.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kW`;
        };

        const formatEnergy = (val) => {
            if (val === undefined || val === null) return '0.0 KWh';
            let kwh = val / 1000;
            return `${kwh.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KWh`;
        };

        const formatEnergyMWh = (val) => {
            if (val === undefined || val === null) return '0.0 MWh';
            let mwh = val / 1000000;
            return `${mwh.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MWh`;
        };


        const formatCo2 = (val) => {
            if (!val) return '0 kg';
            if (val >= 1000) return `${(val / 1000).toFixed(2)} t`;
            return `${val.toFixed(2)} kg`;
        };

        const formatRevenue = (val) => {
            if (!val) return '0';
            return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        };

        const powerDetailsData = ref({});

        const loadDashboardData = async () => {
            try {
                const today = selectedDate.value;
                const startTime = `${today} 00:00:00`;
                const endTime = `${today} 23:59:59`;

                // Sequence calls to avoid Rate Limit (429)
                const ov = await SolarAPI.getOverview();
                const flow = await SolarAPI.getPowerFlow();
                const env = await SolarAPI.getEnvBenefits();
                const inv = await SolarAPI.getInventory();
                const pDetails = await SolarAPI.getPowerDetails(startTime, endTime);

                overview.value = ov.overview || {};
                const rawFlow = flow.siteCurrentPowerFlow || {};
                powerFlow.value = {
                    unit: rawFlow.unit,
                    pv: rawFlow.PV || rawFlow.pv || {},
                    grid: rawFlow.GRID || rawFlow.grid || {},
                    load: rawFlow.LOAD || rawFlow.load || {},
                    connections: rawFlow.connections || []
                };

                envBenefits.value = env.envBenefits || {};
                inventory.value = inv.Inventory || { inverters: [] };
                powerDetailsData.value = pDetails || {};

                lastUpdateTime.value = formatTimestamp();
                connectionStatus.value = 'online';

                if (activeTab.value === 'dashboard') {
                    nextTick(() => initDashboardCharts());
                }
            } catch (error) {
                console.error('Data Load Error:', error);
                connectionStatus.value = 'offline';
            }
        };

        let areaChart = null;
        let dailyBarChart = null;
        let monthlyBarChart = null;

        const initDashboardCharts = async () => {
            // Daily Area Chart
            const areaCtx = document.getElementById('dailyAreaChart');
            if (areaCtx) {
                if (areaChart) areaChart.destroy();

                const rawData = powerDetailsData.value;
                const meters = rawData?.powerDetails?.meters || [];

                const getMeterValues = (type) => {
                    const meter = meters.find(m => m.type.toLowerCase() === type.toLowerCase());
                    return meter ? meter.values : [];
                };

                const productionValues = getMeterValues('Production');
                const consumptionValues = getMeterValues('Consumption');
                const purchasedValues = getMeterValues('Purchased');

                // Generate 24-hour labels (00:00 to 23:55, every 5 mins to match typically granular data)
                const timeLabels = [];
                for (let h = 0; h < 24; h++) {
                    for (let m = 0; m < 60; m += 15) { // 15-minute intervals for cleaner chart
                        timeLabels.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }
                }
                timeLabels.push('24:00'); // Explicitly add end of day

                // Helper to map data to time labels
                const mapDataToLabels = (values) => {
                    const dataMap = {};
                    values.forEach(v => {
                        const d = new Date(v.date.replace(' ', 'T'));
                        // Round key to nearest 15 min
                        const h = d.getHours();
                        const m = Math.floor(d.getMinutes() / 15) * 15;
                        const key = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        dataMap[key] = (v.value || 0) / 1000;
                    });

                    // Fill standard labels, use 0 if no data point matches (or null for gaps if preferred)
                    return timeLabels.map(label => dataMap[label] !== undefined ? dataMap[label] : 0);
                };

                const solarData = mapDataToLabels(productionValues);
                const consumptionData = mapDataToLabels(consumptionValues);
                const purchasedData = mapDataToLabels(purchasedValues);

                areaChart = new Chart(areaCtx, {
                    type: 'line',
                    data: {
                        labels: timeLabels,
                        datasets: [
                            {
                                label: 'Solar Production',
                                data: solarData,
                                borderColor: '#5fbcd3', // Blue
                                backgroundColor: '#5fbcd3', // Solid Blue
                                fill: true,
                                tension: 0.4,
                                pointRadius: 0,
                                borderWidth: 0, // Remove border for solid area look
                                order: 1
                            },
                            {
                                label: 'Consumption',
                                data: consumptionData,
                                borderColor: '#f2726f', // Red
                                backgroundColor: '#f2726f', // Solid Red
                                fill: true,
                                tension: 0.4,
                                pointRadius: 0,
                                borderWidth: 0,
                                order: 2
                            },
                            {
                                label: 'Purchased (PEA)',
                                data: purchasedData,
                                borderColor: '#22c55e', // Green
                                backgroundColor: '#22c55e', // Solid Green
                                fill: true,
                                tension: 0.4,
                                pointRadius: 0,
                                borderWidth: 0,
                                order: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} kW`
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: {
                                    color: '#94a3b8',
                                    font: { family: 'Outfit', size: 10 },
                                    maxTicksLimit: 13,
                                    autoSkip: false,
                                    callback: function (val, index) {
                                        const label = this.getLabelForValue(val);
                                        if (index === 0) return label;
                                        if (index === this.chart.data.labels.length - 1) return label;
                                        if (index % 8 === 0) return label;
                                        return null;
                                    }
                                }
                            },
                            y: {
                                stacked: false,
                                grid: { color: 'rgba(226, 232, 240, 0.4)', drawBorder: false },
                                ticks: {
                                    color: '#94a3b8',
                                    font: { family: 'Outfit', size: 10 },
                                    callback: (val) => `${val.toFixed(1)} kW`
                                },
                                title: {
                                    display: true,
                                    text: 'Power (kW)',
                                    color: '#64748b',
                                    font: { family: 'Outfit', weight: '600', size: 12 }
                                }
                            }
                        }
                    }
                });
            }

            // Daily Bar Chart
            const dailyBarCtx = document.getElementById('dailyBarChart');
            if (dailyBarCtx) {
                if (dailyBarChart) dailyBarChart.destroy();

                const labels = [];
                const now = selectedDate.value ? new Date(selectedDate.value) : new Date();

                for (let i = 29; i >= 0; i--) {
                    const d = new Date(now);
                    d.setDate(now.getDate() - i);
                    labels.push(d.getDate().toString().padStart(2, '0') + ' ' + d.toLocaleString('default', { month: 'short' }));
                }

                dailyBarChart = new Chart(dailyBarCtx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Solar',
                                data: Array.from({ length: 30 }, () => Math.random() * 80 + 40),
                                backgroundColor: '#5fbcd3', // Solid Blue
                                borderColor: '#5fbcd3',
                                borderWidth: 0,
                                borderRadius: 4
                            },
                            {
                                label: 'PEA',
                                data: Array.from({ length: 30 }, () => Math.random() * 250 + 100),
                                backgroundColor: '#22c55e', // Solid Green
                                borderColor: '#22c55e',
                                borderWidth: 0,
                                borderRadius: 4
                            }
                        ]
                    },
                    plugins: [ChartDataLabels],
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)} kWh`
                                }
                            },
                            datalabels: {
                                color: '#1e293b',
                                font: { weight: 'bold', size: 9 },
                                textAlign: 'center',
                                formatter: (val, ctx) => {
                                    const dataset = ctx.chart.data.datasets;
                                    const total = dataset[0].data[ctx.dataIndex] + dataset[1].data[ctx.dataIndex];
                                    if (total === 0 || val < (total * 0.1)) return '';
                                    return ((val / total) * 100).toFixed(0);
                                },
                                anchor: 'center',
                                align: 'center'
                            }
                        },
                        scales: {
                            x: {
                                stacked: true,
                                grid: { display: false },
                                ticks: {
                                    color: '#94a3b8',
                                    font: { family: 'Outfit', size: 10 }
                                }
                            },
                            y: {
                                stacked: true,
                                grid: { color: 'rgba(148, 163, 184, 0.1)', drawBorder: false },
                                title: {
                                    display: true,
                                    text: 'Energy (kWh)',
                                    color: '#64748b',
                                    font: { family: 'Outfit', weight: '600', size: 12 }
                                },
                                ticks: {
                                    color: '#94a3b8',
                                    font: { family: 'Outfit', size: 10 },
                                    callback: (val) => `${val} kWh`
                                }
                            }
                        }
                    }
                });
            }

            // Monthly Bar Chart (12-month Percent Ratio)
            const monthlyCtx = document.getElementById('monthlyBarChart');
            if (monthlyCtx) {
                if (monthlyBarChart) monthlyBarChart.destroy();

                const months = [];
                const now = new Date();
                for (let i = 11; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    months.push(d.toLocaleString('default', { month: 'short', year: 'numeric' }));
                }

                monthlyBarChart = new Chart(monthlyCtx, {
                    type: 'bar',
                    plugins: [ChartDataLabels],
                    data: {
                        labels: months,
                        datasets: [
                            {
                                label: 'Solar',
                                data: months.map(() => Math.random() * 0.4 + 0.1),
                                backgroundColor: '#5fbcd3', // Solid Blue
                                borderColor: '#5fbcd3',
                                borderWidth: 0,
                                borderRadius: 4
                            },
                            {
                                label: 'PEA',
                                data: months.map(() => Math.random() * 0.6 + 0.2),
                                backgroundColor: '#22c55e', // Solid Green
                                borderColor: '#22c55e',
                                borderWidth: 0,
                                borderRadius: 4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: {
                            padding: { top: 20 }
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} MWh`
                                }
                            },
                            datalabels: {
                                color: '#1e293b',
                                font: { weight: 'bold', size: 9 },
                                textAlign: 'center',
                                formatter: (val, ctx) => {
                                    const dataset = ctx.chart.data.datasets;
                                    const total = dataset[0].data[ctx.dataIndex] + dataset[1].data[ctx.dataIndex];
                                    if (val < 0.1) return '';
                                    return ((val / total) * 100).toFixed(0) + '%';
                                },
                                anchor: 'center',
                                align: 'center'
                            }
                        },
                        scales: {
                            x: {
                                stacked: true,
                                grid: { display: false },
                                ticks: {
                                    color: '#94a3b8',
                                    font: { family: 'Outfit', size: 10 }
                                }
                            },
                            y: {
                                stacked: true,
                                grid: { color: 'rgba(148, 163, 184, 0.1)', drawBorder: false },
                                ticks: {
                                    color: '#94a3b8',
                                    font: { family: 'Outfit', size: 10 },
                                    callback: (val) => `${val.toFixed(1)} MWh`
                                }
                            }
                        }
                    }
                });

                // Add separate plugin for Totals above bars
                const totalPlugin = {
                    id: 'totalsAboveBars',
                    afterDraw: (chart) => {
                        const { ctx, data, scales: { x, y } } = chart;
                        if (chart.options.plugins.datalabels.display === false) return;

                        ctx.save();
                        ctx.font = 'bold 10px Outfit';
                        ctx.fillStyle = '#1e293b';
                        ctx.textAlign = 'center';

                        const meta0 = chart.getDatasetMeta(0);
                        const meta1 = chart.getDatasetMeta(1);

                        data.labels.forEach((label, i) => {
                            const total = data.datasets[0].data[i] + data.datasets[1].data[i];
                            const xPos = meta0.data[i].x;
                            const yPos = Math.min(meta0.data[i].y, meta1.data[i].y) - 10;
                            ctx.fillText(`${total.toFixed(1)} MWh`, xPos, yPos);
                        });
                        ctx.restore();
                    }
                };
                monthlyBarChart.config.plugins.push(totalPlugin);
            }
        };

        watch(activeTab, (newTab) => {
            if (newTab === 'dashboard') nextTick(() => initDashboardCharts());
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });

        // Watch selectedDate to reload data
        watch(selectedDate, (newDate, oldDate) => {
            if (newDate !== oldDate) {
                loadDashboardData();
            }
        });

        // Window Controls
        const setupWindowControls = () => {
            // Check if electronAPI exists (it won't in standard browser)
            if (window.electronAPI) {
                const minimizeBtn = document.getElementById('btn-minimize');
                const maximizeBtn = document.getElementById('btn-maximize');
                const closeBtn = document.getElementById('btn-close');

                if (minimizeBtn) minimizeBtn.addEventListener('click', () => window.electronAPI.minimize());
                if (maximizeBtn) maximizeBtn.addEventListener('click', () => window.electronAPI.toggleMaximize());
                if (closeBtn) closeBtn.addEventListener('click', () => window.electronAPI.close());
            } else {
                console.log("Electron API not found. Window controls disabled.");
            }
        };

        onMounted(() => {
            // Setup window controls
            setupWindowControls();

            // Initial data load
            loadDashboardData().then(() => {
                // Hide loading screen after data is ready
                const loader = document.getElementById('loading-screen');
                if (loader) {
                    setTimeout(() => {
                        loader.classList.add('hidden');
                    }, 500);
                }
            });

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            // Initialize Flatpickr
            flatpickr(".hidden-date-input", {
                dateFormat: "Y-m-d",
                defaultDate: selectedDate.value,
                disableMobile: true, // Force custom picker on mobile
                onChange: (selectedDates, dateStr) => {
                    selectedDate.value = dateStr;
                }
            });

            setInterval(loadDashboardData, 5 * 60 * 1000);

            // Handle Fullscreen Exit Layout Fix
            document.addEventListener('fullscreenchange', () => {
                // Force a resize event to update charts and layout
                window.dispatchEvent(new Event('resize'));
                // Optional: Re-init if drastic layout changes occur
                setTimeout(() => {
                    initDashboardCharts();
                }, 100);
            });
        });


        const toggleFullScreen = () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(e => {
                    console.error(`Error attempting to enable full-screen mode: ${e.message} (${e.name})`);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        };

        return {
            activeTab, connectionStatus, connectionStatusText,
            overview, powerFlow, envBenefits, inventory,
            chartDays, selectedDate, lastUpdateTime,
            formatPower, formatEnergy, formatEnergyMWh, formatCo2, formatRevenue,
            flowSpeeds, inverterStatusSummary,
            loadDashboardData,
            formattedSelectedDate,
            toggleFullScreen

        };
    }
}).mount('#app');
