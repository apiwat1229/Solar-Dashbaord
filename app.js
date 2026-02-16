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
            if (val === undefined || val === null) return '0 KWh';
            let kwh = val / 1000;
            return `${Math.round(kwh).toLocaleString()} KWh`;
        };

        const formatEnergyMWh = (val) => {
            if (val === undefined || val === null) return '0 MWh';
            let mwh = val / 1000000;
            return `${mwh.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} MWh`;
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

                const [ov, flow, env, inv, pDetails] = await Promise.all([
                    SolarAPI.getOverview(),
                    SolarAPI.getPowerFlow(),
                    SolarAPI.getEnvBenefits(),
                    SolarAPI.getInventory(),
                    SolarAPI.getPowerDetails(startTime, endTime)
                ]);

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

                const labels = productionValues.map(p => {
                    const d = new Date(p.date.replace(' ', 'T'));
                    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                });

                const solarData = productionValues.map(p => (p.value || 0) / 1000);
                const consumptionData = consumptionValues.map(p => (p.value || 0) / 1000);
                const purchasedData = purchasedValues.map(p => (p.value || 0) / 1000);

                areaChart = new Chart(areaCtx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Solar Production',
                                data: solarData,
                                borderColor: '#5fbcd3',
                                backgroundColor: 'rgba(95, 188, 211, 0.4)',
                                fill: true,
                                tension: 0.4,
                                pointRadius: 0,
                                borderWidth: 1
                            },
                            {
                                label: 'Purchased (PEA)',
                                data: purchasedData,
                                borderColor: '#f2726f',
                                backgroundColor: 'rgba(242, 114, 111, 0.4)',
                                fill: true,
                                tension: 0.4,
                                pointRadius: 0,
                                borderWidth: 1
                            },
                            {
                                label: 'Consumption',
                                data: consumptionData,
                                borderColor: '#ffbb00',
                                backgroundColor: 'rgba(255, 187, 0, 0.4)',
                                fill: true,
                                tension: 0.4,
                                pointRadius: 0,
                                borderWidth: 1
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
                            x: { grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 12 } },
                            y: {
                                stacked: false,
                                grid: { color: 'rgba(226, 232, 240, 0.8)' },
                                ticks: {
                                    color: '#64748b',
                                    callback: (val) => `${val.toFixed(1)} kW`
                                },
                                title: {
                                    display: true,
                                    text: 'Power (kW)',
                                    font: { family: 'Outfit', weight: 'bold' }
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

                // Generate 30 days of labels
                const labels = [];
                const now = new Date();
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
                                backgroundColor: '#5fbcd3',
                                borderRadius: 4
                            },
                            {
                                label: 'PEA',
                                data: Array.from({ length: 30 }, () => Math.random() * 250 + 100),
                                backgroundColor: '#f2726f',
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
                                color: '#fff',
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
                            x: { stacked: true, grid: { display: false } },
                            y: {
                                stacked: true,
                                grid: { color: 'rgba(148, 163, 184, 0.1)' },
                                title: {
                                    display: true,
                                    text: 'Power (kW)',
                                    font: { family: 'Outfit', weight: 'bold' }
                                },
                                ticks: {
                                    callback: (val) => `${val} kW`
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
                                backgroundColor: '#5fbcd3',
                                borderRadius: 4
                            },
                            {
                                label: 'PEA',
                                data: months.map(() => Math.random() * 0.6 + 0.2),
                                backgroundColor: '#f2726f',
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
                                color: '#fff',
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
                            x: { stacked: true, grid: { display: false } },
                            y: {
                                stacked: true,
                                ticks: {
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

        onMounted(() => {
            loadDashboardData();
            if (typeof lucide !== 'undefined') lucide.createIcons();
            setInterval(loadDashboardData, 5 * 60 * 1000);
        });

        return {
            activeTab, connectionStatus, connectionStatusText,
            overview, powerFlow, envBenefits, inventory,
            chartDays, selectedDate, lastUpdateTime,
            formatPower, formatEnergy, formatEnergyMWh, formatCo2, formatRevenue,
            flowSpeeds, inverterStatusSummary,
            loadDashboardData
        };
    }
}).mount('#app');
