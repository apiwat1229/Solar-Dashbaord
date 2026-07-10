const { createApp, ref, onMounted, onUnmounted, computed, watch, nextTick } = Vue;

createApp({
    setup() {
        const activeTab = ref('dashboard');
        const connectionStatus = ref('online');

        const overview = ref({});
        const powerFlow = ref({});
        const envBenefits = ref({});
        const inventory = ref({ inverters: [] });
        const chartDays = ref(1);

        const formatDateValue = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const displayMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const getTodayDate = () => formatDateValue(new Date());
        const shiftDateValue = (dateStr, days) => {
            const date = new Date(`${dateStr}T00:00:00`);
            date.setDate(date.getDate() + days);
            return formatDateValue(date);
        };
        const shiftMonthValue = (dateStr, months) => {
            const date = new Date(`${dateStr}T00:00:00`);
            date.setMonth(date.getMonth() + months);
            return formatDateValue(date);
        };
        const getStartOfMonthValue = (dateStr) => {
            const date = new Date(`${dateStr}T00:00:00`);
            date.setDate(1);
            return formatDateValue(date);
        };
        const getStartOfWeekValue = (dateStr) => {
            const date = new Date(`${dateStr}T00:00:00`);
            const offset = (date.getDay() + 6) % 7;
            date.setDate(date.getDate() - offset);
            return formatDateValue(date);
        };
        const getInclusiveDaySpan = (startDate, endDate) => {
            const start = new Date(`${startDate}T00:00:00`);
            const end = new Date(`${endDate}T00:00:00`);
            return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
        };
        const formatShortPercent = (value) => `${Math.abs(value).toFixed(1)}%`;

        const selectedRangeStart = ref(getTodayDate());
        const selectedRangeEnd = ref(getTodayDate());

        const formatTimestamp = () => {
            const now = new Date();
            const months = displayMonths;
            const day = String(now.getDate()).padStart(2, '0');
            const month = months[now.getMonth()];
            const year = now.getFullYear();
            const time = now.toTimeString().split(' ')[0];
            return `${day}-${month}-${year} | ${time}`;
        };
        const lastUpdateTime = ref(formatTimestamp());
        const powerFlowUpdatedAt = ref(null);

        const formatDisplayDateTimeFull = (date) => {
            if (!date) return '-';
            const months = displayMonths;
            const day = String(date.getDate()).padStart(2, '0');
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            const time = date.toTimeString().split(' ')[0];
            return `${day}-${month}-${year} | ${time}`;
        };

        const powerFlowUpdatedAtText = computed(() => formatDisplayDateTimeFull(powerFlowUpdatedAt.value));

        const formatDisplayDate = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(`${dateStr}T00:00:00`);
            const day = String(date.getDate()).padStart(2, '0');
            const month = displayMonths[date.getMonth()];
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        };

        const formatHHMMFromMinutes = (minutes) => {
            const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, Number(minutes) || 0));
            const hh = String(Math.floor(safeMinutes / 60)).padStart(2, '0');
            const mm = String(safeMinutes % 60).padStart(2, '0');
            return `${hh}:${mm}`;
        };

        const formatDisplayDateTime = (dateStr, minutes) => {
            if (!dateStr) return '';
            return `${formatDisplayDate(dateStr)} ${formatHHMMFromMinutes(minutes)}`;
        };

        const formattedSelectedDate = computed(() => {
            if (!selectedRangeStart.value || !selectedRangeEnd.value) return '';
            if (selectedRangeStart.value === selectedRangeEnd.value) {
                return formatDisplayDate(selectedRangeStart.value);
            }
            return `${formatDisplayDate(selectedRangeStart.value)} - ${formatDisplayDate(selectedRangeEnd.value)}`;
        });

        const selectedRangeLabel = computed(() => {
            if (!selectedRangeStart.value || !selectedRangeEnd.value) return '';
            if (selectedRangeStart.value === selectedRangeEnd.value) {
                return '';
            }
            return 'Date Range';
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
        const previousDayPowerDetails = ref({});
        const trendDailyEnergyData = ref([]);
        const lifetimeConsumptionData = ref([]);
        const dataPeriod = ref({});
        const consumptionTrendCards = ref([]);
        const consumptionSummary = ref({
            todayText: '0.0 KWh',
            monthText: '0.0 MWh',
            lifetimeText: '0.0 MWh'
        });
        const isDemoMode = ref(false);
        const showCloseConfirm = ref(false);
        let datePickerInstance = null;
        let realtimeRefreshTimer = null;
        let trendSummaryRefreshTimer = null;
        let powerFlowRefreshTimer = null;

        const applyDateRange = (startDate, endDate = startDate) => {
            selectedRangeStart.value = startDate;
            selectedRangeEnd.value = endDate || startDate;
            if (datePickerInstance) {
                datePickerInstance.setDate([selectedRangeStart.value, selectedRangeEnd.value], false);
            }
        };

        const syncDateRangeFromPicker = (selectedDates) => {
            if (!selectedDates || selectedDates.length === 0) return;
            const startDate = formatDateValue(selectedDates[0]);
            const endDate = formatDateValue(selectedDates[selectedDates.length - 1] || selectedDates[0]);
            selectedRangeStart.value = startDate;
            selectedRangeEnd.value = endDate;
        };

        const getMeterValues = (meters, type) => {
            const meter = (meters || []).find(item => item.type?.toLowerCase() === type.toLowerCase());
            return meter?.values || [];
        };

        const sumPowerValuesAsEnergy = (values, cutoffMinutes = 24 * 60) => {
            return (values || []).reduce((total, item) => {
                if (!item?.date) return total;
                const sampleDate = new Date(item.date.replace(' ', 'T'));
                const sampleMinutes = sampleDate.getHours() * 60 + sampleDate.getMinutes();
                if (sampleMinutes > cutoffMinutes) return total;
                return total + ((Number(item.value) || 0) / 4);
            }, 0);
        };

        const sumEnergyValuesByDateRange = (values, startDate, endDate) => {
            return (values || []).reduce((total, item) => {
                const dateKey = (item?.date || '').slice(0, 10);
                if (!dateKey || dateKey < startDate || dateKey > endDate) return total;
                return total + (Number(item.value) || 0);
            }, 0);
        };

        const sumEnergyValues = (values) => {
            return (values || []).reduce((total, item) => total + (Number(item.value) || 0), 0);
        };

        const buildTrendCard = ({ key, title, compareLabel, compareRangeText, currentValue, previousValue, formatter = formatEnergy }) => {
            const hasPrevious = previousValue > 0;
            const delta = hasPrevious ? ((currentValue - previousValue) / previousValue) * 100 : 0;
            const deltaAmount = hasPrevious ? (currentValue - previousValue) : 0;
            const direction = !hasPrevious ? 'flat' : (delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat'));
            const statusText = !hasPrevious
                ? 'No previous data'
                : direction === 'up'
                    ? `+${formatShortPercent(delta)}`
                    : direction === 'down'
                        ? `-${formatShortPercent(delta)}`
                        : '0.0%';
            const summary = !hasPrevious
                ? 'Not enough data to compare'
                : direction === 'up'
                    ? `Higher than ${compareLabel}`
                    : direction === 'down'
                        ? `Lower than ${compareLabel}`
                        : `Same as ${compareLabel}`;

            return {
                key,
                title,
                compareLabel,
                compareRangeText,
                currentText: formatter(currentValue),
                previousText: hasPrevious ? formatter(previousValue) : '-',
                deltaText: hasPrevious ? `${deltaAmount >= 0 ? '+' : '-'}${formatter(Math.abs(deltaAmount))}` : '-',
                statusText,
                summary,
                direction
            };
        };

        const computeConsumptionTrends = (focusDate) => {
            const isTodayFocus = focusDate === getTodayDate();
            const now = new Date();
            const cutoffMinutes = isTodayFocus ? (now.getHours() * 60 + now.getMinutes()) : (24 * 60);

            const currentDayConsumption = sumPowerValuesAsEnergy(
                getMeterValues(powerDetailsData.value.powerDetails?.meters, 'Consumption'),
                cutoffMinutes
            );
            const previousDayConsumption = sumPowerValuesAsEnergy(
                getMeterValues(previousDayPowerDetails.value.powerDetails?.meters, 'Consumption'),
                cutoffMinutes
            );

            const dayRangeCurrent = `${formatDisplayDate(focusDate)} 00:00–${formatHHMMFromMinutes(cutoffMinutes)}`;
            const previousDayDate = shiftDateValue(focusDate, -1);
            const dayRangePrevious = `${formatDisplayDate(previousDayDate)} 00:00–${formatHHMMFromMinutes(cutoffMinutes)}`;
            const dayCompareRangeText = `Compared: ${dayRangeCurrent} vs ${dayRangePrevious}`;

            const dailyConsumptionValues = getMeterValues(trendDailyEnergyData.value, 'Consumption');
            const currentWeekStart = getStartOfWeekValue(focusDate);
            const previousWeekStart = shiftDateValue(currentWeekStart, -7);
            const weekSpan = getInclusiveDaySpan(currentWeekStart, focusDate);
            const previousWeekEnd = shiftDateValue(previousWeekStart, weekSpan - 1);
            const currentWeekConsumption = sumEnergyValuesByDateRange(dailyConsumptionValues, currentWeekStart, focusDate);
            const previousWeekConsumption = sumEnergyValuesByDateRange(dailyConsumptionValues, previousWeekStart, previousWeekEnd);
            const weekCompareRangeText = `Compared: ${formatDisplayDate(currentWeekStart)}–${formatDisplayDate(focusDate)} vs ${formatDisplayDate(previousWeekStart)}–${formatDisplayDate(previousWeekEnd)}`;

            const currentMonthStart = getStartOfMonthValue(focusDate);
            const focusDayOfMonth = Number(focusDate.slice(8, 10));
            const previousMonthReference = shiftMonthValue(currentMonthStart, -1);
            const previousMonthStart = getStartOfMonthValue(previousMonthReference);
            const previousMonthEndDate = new Date(`${shiftMonthValue(previousMonthStart, 1)}T00:00:00`);
            previousMonthEndDate.setDate(0);
            const previousMonthLastDay = previousMonthEndDate.getDate();
            const previousMonthEnd = shiftDateValue(previousMonthStart, Math.min(focusDayOfMonth, previousMonthLastDay) - 1);
            const currentMonthConsumption = sumEnergyValuesByDateRange(dailyConsumptionValues, currentMonthStart, focusDate);
            const previousMonthConsumption = sumEnergyValuesByDateRange(dailyConsumptionValues, previousMonthStart, previousMonthEnd);
            const monthCompareRangeText = `Compared: ${formatDisplayDate(currentMonthStart)}–${formatDisplayDate(focusDate)} vs ${formatDisplayDate(previousMonthStart)}–${formatDisplayDate(previousMonthEnd)}`;
            const lifetimeConsumption = sumEnergyValues(
                getMeterValues(lifetimeConsumptionData.value, 'Consumption')
            );

            consumptionSummary.value = {
                todayText: formatEnergy(currentDayConsumption),
                monthText: formatEnergyMWh(currentMonthConsumption),
                lifetimeText: formatEnergyMWh(lifetimeConsumption)
            };

            consumptionTrendCards.value = [
                buildTrendCard({
                    key: 'daily',
                    title: 'Today',
                    compareLabel: 'yesterday at the same time',
                    compareRangeText: dayCompareRangeText,
                    currentValue: currentDayConsumption,
                    previousValue: previousDayConsumption,
                    formatter: formatEnergy
                }),
                buildTrendCard({
                    key: 'weekly',
                    title: 'This Week',
                    compareLabel: 'last week',
                    compareRangeText: weekCompareRangeText,
                    currentValue: currentWeekConsumption,
                    previousValue: previousWeekConsumption,
                    formatter: formatEnergy
                }),
                buildTrendCard({
                    key: 'monthly',
                    title: 'This Month',
                    compareLabel: 'last month',
                    compareRangeText: monthCompareRangeText,
                    currentValue: currentMonthConsumption,
                    previousValue: previousMonthConsumption,
                    formatter: formatEnergyMWh
                })
            ];
        };

        const getFocusDate = () => selectedRangeEnd.value || selectedRangeStart.value || getTodayDate();

        const shouldAutoRefreshDashboard = () => {
            return activeTab.value === 'dashboard' && getFocusDate() === getTodayDate();
        };

        const shouldAutoRefreshPowerFlow = () => {
            return activeTab.value === 'dashboard';
        };

        const getDelayUntilNextQuarterRefresh = () => {
            const now = new Date();
            const next = new Date(now);
            const currentMinutes = now.getMinutes();
            const nextQuarter = Math.floor(currentMinutes / 15) * 15 + 15;

            if (nextQuarter >= 60) {
                next.setHours(now.getHours() + 1, 0, 20, 0);
            } else {
                next.setMinutes(nextQuarter, 20, 0);
            }

            return Math.max(30 * 1000, next.getTime() - now.getTime());
        };

        const getDelayUntilNext8AMRefresh = () => {
            const now = new Date();
            const next = new Date(now);
            next.setHours(8, 0, 20, 0);

            if (next.getTime() <= now.getTime()) {
                next.setDate(next.getDate() + 1);
            }

            return Math.max(30 * 1000, next.getTime() - now.getTime());
        };

        const clearDashboardAutoRefresh = () => {
            if (realtimeRefreshTimer) {
                clearTimeout(realtimeRefreshTimer);
                realtimeRefreshTimer = null;
            }
            if (trendSummaryRefreshTimer) {
                clearTimeout(trendSummaryRefreshTimer);
                trendSummaryRefreshTimer = null;
            }
        };

        const clearPowerFlowAutoRefresh = () => {
            if (powerFlowRefreshTimer) {
                clearTimeout(powerFlowRefreshTimer);
                powerFlowRefreshTimer = null;
            }
        };

        const setPowerFlowFromApi = (d) => {
            const rawFlow = d.siteCurrentPowerFlow || {};
            return { unit: rawFlow.unit, pv: rawFlow.PV || {}, grid: rawFlow.GRID || {}, load: rawFlow.LOAD || {}, connections: rawFlow.connections || [] };
        };

        const refreshPowerFlowOnly = async () => {
            try {
                const d = await SolarAPI.getPowerFlow();
                if (d) {
                    powerFlow.value = setPowerFlowFromApi(d);
                    powerFlowUpdatedAt.value = new Date();
                }
            } catch (error) {
                if (error?.message?.includes('limit') || error?.message?.includes('rate limited')) {
                    connectionStatus.value = 'throttled';
                }
            }
        };

        const schedulePowerFlowAutoRefresh = () => {
            clearPowerFlowAutoRefresh();
            if (!shouldAutoRefreshPowerFlow()) return;

            powerFlowRefreshTimer = setTimeout(async () => {
                await refreshPowerFlowOnly();
                schedulePowerFlowAutoRefresh();
            }, 60 * 1000);
        };

        const scheduleDashboardAutoRefresh = () => {
            clearDashboardAutoRefresh();
            if (!shouldAutoRefreshDashboard()) return;

            realtimeRefreshTimer = setTimeout(async () => {
                await loadRealtimeDashboardData();
                scheduleDashboardAutoRefresh();
            }, getDelayUntilNextQuarterRefresh());

            trendSummaryRefreshTimer = setTimeout(async () => {
                await loadDashboardData();
                scheduleDashboardAutoRefresh();
            }, getDelayUntilNext8AMRefresh());
        };

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
            if (consumptionTrendCards.value.length === 0) {
                consumptionSummary.value = {
                    todayText: '468.2 KWh',
                    monthText: '0.4 MWh',
                    lifetimeText: '5,025.9 MWh'
                };
                consumptionTrendCards.value = [
                    {
                        key: 'daily',
                        title: 'Today',
                        compareLabel: 'yesterday at the same time',
                        compareRangeText: 'Compared: 10-Jul-2026 00:00–09:00 vs 09-Jul-2026 00:00–09:00',
                        currentText: '468.2 KWh',
                        previousText: '432.5 KWh',
                        deltaText: '+35.7 KWh',
                        statusText: '+8.2%',
                        summary: 'Higher than yesterday at the same time',
                        direction: 'up'
                    },
                    {
                        key: 'weekly',
                        title: 'This Week',
                        compareLabel: 'last week',
                        compareRangeText: 'Compared: 07-Jul-2026–10-Jul-2026 vs 30-Jun-2026–03-Jul-2026',
                        currentText: '2,984.0 KWh',
                        previousText: '3,102.0 KWh',
                        deltaText: '-118.0 KWh',
                        statusText: '-3.8%',
                        summary: 'Lower than last week',
                        direction: 'down'
                    },
                    {
                        key: 'monthly',
                        title: 'This Month',
                        compareLabel: 'last month',
                        compareRangeText: 'Compared: 01-Jul-2026–10-Jul-2026 vs 01-Jun-2026–10-Jun-2026',
                        currentText: '0.42 MWh',
                        previousText: '0.39 MWh',
                        deltaText: '+0.03 MWh',
                        statusText: '+7.6%',
                        summary: 'Higher than last month',
                        direction: 'up'
                    }
                ];
            }
            if (!powerDetailsData.value.powerDetails) {
                const focusDate = selectedRangeEnd.value || selectedRangeStart.value || getTodayDate();
                const vP = []; const vC = []; const vB = [];
                for (let i = 0; i < 96; i++) {
                    const timeStr = `${focusDate} ${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00`;
                    const prod = i > 28 && i < 68 ? (Math.sin((i - 28) / 40 * Math.PI) * 7000) : 0;
                    const load = 1500 + Math.random() * 2000;
                    vP.push({ date: timeStr, value: prod }); vC.push({ date: timeStr, value: load }); vB.push({ date: timeStr, value: Math.max(0, load - prod) });
                }
                powerDetailsData.value = { powerDetails: { meters: [{ type: 'Production', values: vP }, { type: 'Consumption', values: vC }, { type: 'Purchased', values: vB }] } };
            }
        };

        const loadRealtimeDashboardData = async () => {
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

            const rangeStart = selectedRangeStart.value || getTodayDate();
            const rangeEnd = selectedRangeEnd.value || rangeStart;
            const focusDate = rangeEnd;
            const startTime = `${focusDate} 00:00:00`;
            const endTime = `${focusDate} 23:59:59`;
            const previousDayDate = shiftDateValue(focusDate, -1);

            await Promise.allSettled([
                updateData(() => SolarAPI.getOverview(), overview, d => d.overview || {}),
                updateData(async () => {
                    const d = await SolarAPI.getPowerFlow();
                    powerFlowUpdatedAt.value = new Date();
                    return d;
                }, powerFlow, setPowerFlowFromApi),
                updateData(() => SolarAPI.getEnvBenefits(), envBenefits, d => d.envBenefits || {}),
                updateData(() => SolarAPI.getInventory(), inventory, d => d.Inventory || { inverters: [] }),
                updateData(() => SolarAPI.getPowerDetails(startTime, endTime), powerDetailsData),
                updateData(() => SolarAPI.getPowerDetails(`${previousDayDate} 00:00:00`, `${previousDayDate} 23:59:59`), previousDayPowerDetails)
            ]);

            if (isThrottled) {
                connectionStatus.value = 'throttled';
                if (Object.keys(overview.value).length === 0 || !powerDetailsData.value.powerDetails) {
                    generateMocks();
                    isDemoMode.value = true;
                }
            } else if (hasError) {
                connectionStatus.value = 'offline';
            } else {
                connectionStatus.value = 'online';
                isDemoMode.value = false;
            }

            computeConsumptionTrends(focusDate);
            lastUpdateTime.value = formatTimestamp();
            if (activeTab.value === 'dashboard') nextTick(() => initDashboardCharts());
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

            const rangeStart = selectedRangeStart.value || getTodayDate();
            const rangeEnd = selectedRangeEnd.value || rangeStart;
            const focusDate = rangeEnd;
            const startTime = `${focusDate} 00:00:00`;
            const endTime = `${focusDate} 23:59:59`;
            const rangeEndDate = new Date(`${rangeEnd}T00:00:00`);
            const date30d = new Date(rangeEndDate);
            date30d.setDate(date30d.getDate() - 29);
            const date12m = new Date(rangeEndDate);
            date12m.setMonth(date12m.getMonth() - 11);
            date12m.setDate(1);
            const start30d = formatDateValue(date30d);
            const start12m = formatDateValue(date12m);
            const rangeEndTime = `${rangeEnd} 23:59:59`;
            const previousDayDate = shiftDateValue(focusDate, -1);
            const trendDailyStart = shiftDateValue(rangeEnd, -62);

            try {
                const periodData = await SolarAPI.getDataPeriod();
                dataPeriod.value = periodData;
            } catch (error) {
                if (error.message.includes('limit') || error.message.includes('rate limited')) isThrottled = true;
                else { console.error(`Error loading data:`, error); hasError = true; }
            }

            const lifetimeStart = dataPeriod.value?.dataPeriod?.startDate || focusDate;

            await Promise.allSettled([
                updateData(() => SolarAPI.getOverview(), overview, d => d.overview || {}),
                updateData(async () => {
                    const d = await SolarAPI.getPowerFlow();
                    powerFlowUpdatedAt.value = new Date();
                    return d;
                }, powerFlow, setPowerFlowFromApi),
                updateData(() => SolarAPI.getEnvBenefits(), envBenefits, d => d.envBenefits || {}),
                updateData(() => SolarAPI.getInventory(), inventory, d => d.Inventory || { inverters: [] }),
                updateData(() => SolarAPI.getPowerDetails(startTime, endTime), powerDetailsData),
                updateData(() => SolarAPI.getPowerDetails(`${previousDayDate} 00:00:00`, `${previousDayDate} 23:59:59`), previousDayPowerDetails),
                updateData(() => SolarAPI.getEnergy(`${start30d} 00:00:00`, rangeEndTime, 'DAY'), energyData30D, d => d.energyDetails?.meters || []),
                updateData(() => SolarAPI.getEnergy(`${start12m} 00:00:00`, rangeEndTime, 'MONTH'), energyData12M, d => d.energyDetails?.meters || []),
                updateData(() => SolarAPI.getEnergy(`${trendDailyStart} 00:00:00`, rangeEndTime, 'DAY'), trendDailyEnergyData, d => d.energyDetails?.meters || []),
                updateData(() => SolarAPI.getEnergy(`${lifetimeStart} 00:00:00`, rangeEndTime, 'MONTH'), lifetimeConsumptionData, d => d.energyDetails?.meters || [])
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

            computeConsumptionTrends(focusDate);
            lastUpdateTime.value = formatTimestamp();
            if (activeTab.value === 'dashboard') nextTick(() => initDashboardCharts());
        };

        const forceRefresh = () => {
            localStorage.removeItem('solar_api_blocked_until');
            loadDashboardData();
        };

        const openCloseConfirm = () => {
            showCloseConfirm.value = true;
        };

        const cancelCloseConfirm = () => {
            showCloseConfirm.value = false;
        };

        const confirmCloseApp = () => {
            showCloseConfirm.value = false;
            if (window.electronAPI) window.electronAPI.close();
        };

        let areaChart = null;
        let dailyBarChart = null;
        let monthlyBarChart = null;
        let resizeTimer = null;

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
            scheduleDashboardAutoRefresh();
            schedulePowerFlowAutoRefresh();
        });

        watch([selectedRangeStart, selectedRangeEnd], ([newStart, newEnd], [oldStart, oldEnd]) => {
            if (!newStart || !newEnd) return;
            if (newStart === oldStart && newEnd === oldEnd) return;
            loadDashboardData();
            scheduleDashboardAutoRefresh();
        });

        watch(showCloseConfirm, (isVisible) => {
            if (isVisible && typeof lucide !== 'undefined') {
                nextTick(() => lucide.createIcons());
            }
        });

        const setupWindowControls = () => {
            if (window.electronAPI) {
                const minimizeBtn = document.getElementById('btn-minimize');
                const maximizeBtn = document.getElementById('btn-maximize');
                const reloadBtn = document.getElementById('btn-reload');
                if (minimizeBtn) minimizeBtn.addEventListener('click', () => window.electronAPI.minimize());
                if (maximizeBtn) maximizeBtn.addEventListener('click', () => window.electronAPI.toggleFullscreen());
                if (reloadBtn) reloadBtn.addEventListener('click', () => window.electronAPI.reload());
            }
        };

        const toggleFullScreen = () => {
            if (window.electronAPI?.toggleFullscreen) {
                window.electronAPI.toggleFullscreen();
                return;
            }
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else if (document.exitFullscreen) document.exitFullscreen();
        };

        const handleWindowResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (activeTab.value === 'dashboard') {
                    initDashboardCharts();
                }
            }, 120);
        };

        onMounted(() => {
            setupWindowControls();
            loadDashboardData().then(() => {
                const loader = document.getElementById('loading-screen');
                if (loader) setTimeout(() => loader.classList.add('hidden'), 500);
                if (typeof lucide !== 'undefined') lucide.createIcons();
                scheduleDashboardAutoRefresh();
                schedulePowerFlowAutoRefresh();
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
            const dateInput = document.querySelector(".hidden-date-input");
            if (dateInput) {
                datePickerInstance = flatpickr(dateInput, {
                    mode: "range",
                    dateFormat: "Y-m-d",
                    defaultDate: [selectedRangeStart.value, selectedRangeEnd.value],
                    disableMobile: true,
                    onOpen: (_, __, instance) => {
                        instance.jumpToDate(getTodayDate());
                    },
                    onChange: (selectedDates) => {
                        syncDateRangeFromPicker(selectedDates);
                    }
                });
            }
            window.addEventListener('resize', handleWindowResize);
            document.addEventListener('fullscreenchange', () => {
                window.dispatchEvent(new Event('resize'));
                setTimeout(() => initDashboardCharts(), 100);
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && showCloseConfirm.value) {
                    cancelCloseConfirm();
                }
            });
        });

        onUnmounted(() => {
            clearDashboardAutoRefresh();
            clearPowerFlowAutoRefresh();
        });

        return {
            activeTab, connectionStatus, connectionStatusText,
            overview, powerFlow, envBenefits, inventory,
            chartDays, selectedRangeStart, selectedRangeEnd, selectedRangeLabel, lastUpdateTime,
            formatPower, formatEnergy, formatEnergyMWh, formatCo2, formatRevenue,
            flowSpeeds, inverterStatusSummary, consumptionTrendCards, consumptionSummary,
            loadDashboardData, forceRefresh, isDemoMode,
            formattedSelectedDate, toggleFullScreen, powerFlowUpdatedAtText,
            showCloseConfirm, openCloseConfirm, cancelCloseConfirm, confirmCloseApp
        };
    }
}).mount('#app');
