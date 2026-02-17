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

        const connectionStatusText = computed(() => {
            if (connectionStatus.value === 'throttled') {
                const blockedUntil = localStorage.getItem('solar_api_blocked_until');
                if (blockedUntil) {
                    const timeStr = new Date(parseInt(blockedUntil)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return `Throttled (until ${timeStr})`;
                }
                return 'Rate Limited';
            }
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
                const duration = Math.max(0.5, Math.min(5, 10 / (val / 1000 + 0.1)));
                return `${duration.toFixed(2)}s`;
            };
            return {
                solar: getSpeed(powerFlow.value.pv?.currentPower),
                grid: getSpeed(powerFlow.value.grid?.currentPower),
                load: getSpeed(powerFlow.value.load?.currentPower),
                ups: '3s',
                battery: '0s'
            };
        });

        const formatPower = (val, unit = 'W') => {
            if (val === undefined || val === null) return '0 kW';
            let kw = unit && unit.toLowerCase() === 'kw' ? val : val / 1000;
            const absoluteKw = Math.abs(kw);
            const decimals = absoluteKw < 10 ? 2 : 0;
            return `${kw.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })} kW`;
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
        const energyData30D = ref([]);
        const energyData12M = ref([]);
        const isDemoMode = ref(false);

        const generateMocks = () => {
            if (Object.keys(overview.value).length === 0) {
                overview.value = {
                    lastDayData: { energy: 45200 },
                    lastMonthData: { energy: 1250000 },
                    lifeTimeData: { energy: 15400000 },
                    currentPower: { power: 5200 }
                };
            }
            if (Object.keys(powerFlow.value).length === 0) {
                powerFlow.value = {
                    unit: 'W',
                    pv: { currentPower: 5200 }, grid: { currentPower: 1200 }, load: { currentPower: 4000 },
                    connections: [{ from: 'PV', to: 'LOAD' }, { from: 'GRID', to: 'LOAD' }]
                };
            }
            if (!powerDetailsData.value.powerDetails) {
                const now = new Date();
                const vP = []; const vC = []; const vB = [];
                for (let i = 0; i < 96; i++) {
                    const timeStr = `${selectedDate.value} ${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00`;
                    const prod = i > 28 && i < 68 ? (Math.sin((i - 28) / 40 * Math.PI) * 7000) : 0;
                    const load = 1500 + Math.random() * 2000;
                    vP.push({ date: timeStr, value: prod }); vC.push({ date: timeStr, value: load }); vB.push({ date: timeStr, value: Math.max(0, load - prod) });
                }
                powerDetailsData.value = { powerDetails: { meters: [{ type: 'Production', values: vP }, { type: 'Consumption', values: vC }, { type: 'Purchased', values: vB }] } };
            }
        };

        const loadDashboardData = async () => {
            let hasError = false;
            let isThrottled = false;

            const updateData = async (task, targetRef, processFn) => {
                try {
                    const data = await task();
                    if (data) targetRef.value = processFn ? processFn(data) : data;
                } catch (error) {
                    if (error.message.includes('limit') || error.message.includes('rate limited')) isThrottled = true;
                    else { console.error(`Error loading data:`, error); hasError = true; }
                }
            };

            const today = selectedDate.value;
            const startTime = `${today} 00:00:00`;
            const endTime = `${today} 23:59:59`;

            const date30d = new Date(); date30d.setDate(date30d.getDate() - 29);
            const date12m = new Date(); date12m.setMonth(date12m.getMonth() - 11);
            const start30d = date30d.toISOString().split('T')[0];
            const start12m = date12m.toISOString().split('T')[0].substring(0, 7) + '-01';

            await Promise.allSettled([
                updateData(() => SolarAPI.getOverview(), overview, d => d.overview || {}),
                updateData(() => SolarAPI.getPowerFlow(), powerFlow, d => {
                    const rawFlow = d.siteCurrentPowerFlow || {};
                    return { unit: rawFlow.unit, pv: rawFlow.PV || {}, grid: rawFlow.GRID || {}, load: rawFlow.LOAD || {}, connections: rawFlow.connections || [] };
                }),
                updateData(() => SolarAPI.getEnvBenefits(), envBenefits, d => d.envBenefits || {}),
                updateData(() => SolarAPI.getInventory(), inventory, d => d.Inventory || { inverters: [] }),
                updateData(() => SolarAPI.getPowerDetails(startTime, endTime), powerDetailsData),
                updateData(() => SolarAPI.getEnergy(start30d + ' 00:00:00', today + ' 23:59:59', 'DAY'), energyData30D, d => d.energyDetails?.meters || []),
                updateData(() => SolarAPI.getEnergy(start12m + ' 00:00:00', today + ' 23:59:59', 'MONTH'), energyData12M, d => d.energyDetails?.meters || [])
            ]);

            isDemoMode.value = false;
            if (isThrottled) {
                connectionStatus.value = 'throttled';
                if (Object.keys(overview.value).length === 0 || !powerDetailsData.value.powerDetails) {
                    generateMocks();
                    isDemoMode.value = true;
                }
            } else if (hasError) connectionStatus.value = 'offline';
            else connectionStatus.value = 'online';

            lastUpdateTime.value = formatTimestamp();
            if (activeTab.value === 'dashboard') nextTick(() => initDashboardCharts());
        };

        const forceRefresh = () => {
            localStorage.removeItem('solar_api_blocked_until');
            loadDashboardData();
        };

        let areaChart = null;
        let dailyBarChart = null;
        let monthlyBarChart = null;

        const initDashboardCharts = async () => {
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

                const timeLabels = [];
                for (let h = 0; h < 24; h++) {
                    for (let m = 0; m < 60; m += 15) {
                        timeLabels.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }
                }
                timeLabels.push('24:00');

                const mapDataToLabels = (values) => {
                    const dataMap = {};
                    values.forEach(v => {
                        const d = new Date(v.date.replace(' ', 'T'));
                        const h = d.getHours();
                        const m = Math.floor(d.getMinutes() / 15) * 15;
                        const key = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        dataMap[key] = (v.value || 0) / 1000;
                    });
                    return timeLabels.map(label => dataMap[label] !== undefined ? dataMap[label] : 0);
                };

                areaChart = new Chart(areaCtx, {
                    type: 'line',
                    data: {
                        labels: timeLabels,
                        datasets: [
                            { label: 'Solar Production', data: mapDataToLabels(productionValues), backgroundColor: '#5fbcd3', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 0, order: 1 },
                            { label: 'Consumption', data: mapDataToLabels(consumptionValues), backgroundColor: '#f2726f', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 0, order: 2 },
                            { label: 'Purchased (PEA)', data: mapDataToLabels(purchasedValues), backgroundColor: '#22c55e', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 0, order: 3 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} kW` } } },
                        scales: {
                            x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 13 } },
                            y: { grid: { color: 'rgba(226, 232, 240, 0.4)', drawBorder: false }, ticks: { color: '#94a3b8', font: { size: 10 }, callback: (val) => `${Math.round(val).toLocaleString()} kW` } }
                        }
                    }
                });
            }

            const dailyBarCtx = document.getElementById('dailyBarChart');
            if (dailyBarCtx) {
                if (dailyBarChart) dailyBarChart.destroy();

                const meters = energyData30D.value || [];
                const production = meters.find(m => m.type.toLowerCase() === 'production')?.values || [];
                const purchased = meters.find(m => m.type.toLowerCase() === 'purchased')?.values || [];

                // Sort by date
                const sortedProd = [...production].sort((a, b) => new Date(a.date) - new Date(b.date));
                const labels = sortedProd.map(v => {
                    const d = new Date(v.date);
                    return d.getDate().toString().padStart(2, '0') + ' ' + d.toLocaleString('default', { month: 'short' });
                });

                const solarData = sortedProd.map(v => (v.value || 0) / 1000);
                const peaData = labels.map(label => {
                    const match = purchased.find(v => {
                        const d = new Date(v.date);
                        const key = d.getDate().toString().padStart(2, '0') + ' ' + d.toLocaleString('default', { month: 'short' });
                        return key === label;
                    });
                    return match ? (match.value || 0) / 1000 : 0;
                });

                dailyBarChart = new Chart(dailyBarCtx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            { label: 'Solar', data: solarData, backgroundColor: '#5fbcd3', borderWidth: 0, borderRadius: 4 },
                            { label: 'PEA', data: peaData, backgroundColor: '#f2726f', borderWidth: 0, borderRadius: 4 }
                        ]
                    },
                    plugins: [ChartDataLabels],
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)} kWh` } },
                            datalabels: {
                                color: '#fff', font: { weight: 'bold', size: 9 },
                                formatter: (val, ctx) => {
                                    const total = ctx.chart.data.datasets.reduce((acc, ds) => acc + ds.data[ctx.dataIndex], 0);
                                    return (total > 0 && val > total * 0.1) ? ((val / total) * 100).toFixed(0) : '';
                                },
                                anchor: 'center', align: 'center'
                            }
                        },
                        scales: {
                            x: { stacked: true, grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                            y: {
                                stacked: true,
                                grid: { color: 'rgba(148, 163, 184, 0.1)', drawBorder: false },
                                ticks: { color: '#94a3b8', font: { size: 10 }, callback: (v) => `${Math.round(v).toLocaleString()} kWh` },
                                title: { display: true, text: 'Energy (kWh)', color: '#64748b', font: { weight: '600', size: 11 } }
                            }
                        }
                    }
                });
            }

            const monthlyCtx = document.getElementById('monthlyBarChart');
            if (monthlyCtx) {
                if (monthlyBarChart) monthlyBarChart.destroy();

                const meters = energyData12M.value || [];
                const production = meters.find(m => m.type.toLowerCase() === 'production')?.values || [];
                const purchased = meters.find(m => m.type.toLowerCase() === 'purchased')?.values || [];

                const sortedProd = [...production].sort((a, b) => new Date(a.date) - new Date(b.date));
                const months = sortedProd.map(v => {
                    const d = new Date(v.date);
                    return d.toLocaleString('default', { month: 'short', year: 'numeric' });
                });

                const solarMWh = sortedProd.map(v => (v.value || 0) / 1000000);
                const peaMWh = months.map(month => {
                    const match = purchased.find(v => {
                        const d = new Date(v.date);
                        return d.toLocaleString('default', { month: 'short', year: 'numeric' }) === month;
                    });
                    return match ? (match.value || 0) / 1000000 : 0;
                });

                monthlyBarChart = new Chart(monthlyCtx, {
                    type: 'bar', plugins: [ChartDataLabels],
                    data: {
                        labels: months,
                        datasets: [
                            { label: 'Solar', data: solarMWh, backgroundColor: '#5fbcd3', borderWidth: 0, borderRadius: 4 },
                            { label: 'PEA', data: peaMWh, backgroundColor: '#f2726f', borderWidth: 0, borderRadius: 4 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, layout: { padding: { top: 25 } },
                        plugins: {
                            legend: { display: false },
                            tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} MWh` } },
                            datalabels: {
                                color: '#fff', font: { weight: 'bold', size: 9 },
                                formatter: (val, ctx) => {
                                    const total = ctx.chart.data.datasets.reduce((acc, ds) => acc + ds.data[ctx.dataIndex], 0);
                                    return (total > 0 && val > total * 0.1) ? ((val / total) * 100).toFixed(0) + '%' : '';
                                },
                                anchor: 'center', align: 'center'
                            }
                        },
                        scales: {
                            x: { stacked: true, grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                            y: {
                                stacked: true,
                                grid: { color: 'rgba(148, 163, 184, 0.1)', drawBorder: false },
                                ticks: { color: '#94a3b8', font: { size: 10 }, callback: (v) => `${Math.round(v).toLocaleString()} MWh` },
                                title: { display: true, text: 'Energy (MWh)', color: '#64748b', font: { weight: '600', size: 11 } }
                            }
                        }
                    }
                });

                // Totals Plugin for Monthly Chart
                const totalPlugin = {
                    id: 'totalsAboveBars',
                    afterDraw: (chart) => {
                        const { ctx, data, scales: { x, y } } = chart;
                        ctx.save();
                        ctx.font = 'bold 9px Outfit';
                        ctx.fillStyle = '#64748b';
                        ctx.textAlign = 'center';

                        const meta0 = chart.getDatasetMeta(0);
                        const meta1 = chart.getDatasetMeta(1);

                        data.labels.forEach((label, i) => {
                            const total = (data.datasets[0].data[i] || 0) + (data.datasets[1].data[i] || 0);
                            if (total <= 0) return;
                            const xPos = meta0.data[i].x;
                            // Top of the stack
                            const yPos = Math.min(meta0.data[i].y, meta1.data[i].y) - 8;
                            ctx.fillText(`${total.toFixed(1)} M`, xPos, yPos);
                        });
                        ctx.restore();
                    }
                };
                monthlyBarChart.config.plugins.push(totalPlugin);
                monthlyBarChart.update();
            }
        };

        watch(activeTab, (newTab) => {
            if (newTab === 'dashboard') nextTick(() => {
                initDashboardCharts();
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
            else if (typeof lucide !== 'undefined') lucide.createIcons();
        });

        watch(selectedDate, () => loadDashboardData());

        const setupWindowControls = () => {
            if (window.electronAPI) {
                const minimizeBtn = document.getElementById('btn-minimize');
                const maximizeBtn = document.getElementById('btn-maximize');
                const closeBtn = document.getElementById('btn-close');
                const reloadBtn = document.getElementById('btn-reload');
                if (minimizeBtn) minimizeBtn.addEventListener('click', () => window.electronAPI.minimize());
                if (maximizeBtn) maximizeBtn.addEventListener('click', () => window.electronAPI.toggleMaximize());
                if (closeBtn) closeBtn.addEventListener('click', () => window.electronAPI.close());
                if (reloadBtn) reloadBtn.addEventListener('click', () => window.electronAPI.reload());
            }
        };

        const toggleFullScreen = () => {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else if (document.exitFullscreen) document.exitFullscreen();
        };

        onMounted(() => {
            setupWindowControls();
            loadDashboardData().then(() => {
                const loader = document.getElementById('loading-screen');
                if (loader) setTimeout(() => loader.classList.add('hidden'), 500);
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
            flatpickr(".hidden-date-input", {
                dateFormat: "Y-m-d", defaultDate: selectedDate.value, disableMobile: true,
                onChange: (selectedDates, dateStr) => { selectedDate.value = dateStr; }
            });
            setInterval(loadDashboardData, 15 * 60 * 1000);
            document.addEventListener('fullscreenchange', () => {
                window.dispatchEvent(new Event('resize'));
                setTimeout(() => initDashboardCharts(), 100);
            });
        });

        return {
            activeTab, connectionStatus, connectionStatusText,
            overview, powerFlow, envBenefits, inventory,
            chartDays, selectedDate, lastUpdateTime,
            formatPower, formatEnergy, formatEnergyMWh, formatCo2, formatRevenue,
            flowSpeeds, inverterStatusSummary,
            loadDashboardData, forceRefresh, isDemoMode,
            formattedSelectedDate, toggleFullScreen
        };
    }
}).mount('#app');
