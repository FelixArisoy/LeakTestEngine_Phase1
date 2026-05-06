const stationDataExpr = '%s%PLC1.GVL_VisuControlHMI.aDataGridStationRecipe%/s%';
const stationCountExpr = '%s%PLC1.GVL_StationConfig.nNumOfActiveStations%/s%';
let fullStationRows = [];
let activeStationCount = 1;
let isRefreshingStationGrid = false;
function toArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort((left, right) => Number(left) - Number(right))
            .map(key => value[key]);
    }
    return [];
}
function refreshStationGrid() {
    const grid = TcHmi.Controls.get('TcHmiDatagridStationRecipe');
    if (!grid)
        return;
    const requestedRowCount = activeStationCount > 0 ? activeStationCount : 1;
    const visibleRowCount = Math.max(1, Math.min(requestedRowCount, fullStationRows.length));
    const visibleRows = fullStationRows.slice(0, visibleRowCount);
    isRefreshingStationGrid = true;
    grid.setSrcData(visibleRows);
    grid.setHeightMode('Value');
    grid.setHeight(267);
    grid.setVisibility('Visible');
    window.setTimeout(() => {
        isRefreshingStationGrid = false;
    }, 0);
}
new TcHmi.Symbol(stationDataExpr).watch(data => {
    if (data.error !== TcHmi.Errors.NONE)
        return;
    fullStationRows = toArray(data.value);
    refreshStationGrid();
});
new TcHmi.Symbol(stationCountExpr).watch(data => {
    if (data.error !== TcHmi.Errors.NONE)
        return;
    const configuredCount = Number(data.value || 0);
    activeStationCount = configuredCount > 0 ? configuredCount : 1;
    if (configuredCount <= 0) {
        TcHmi.Symbol.writeEx(stationCountExpr, 1);
    }
    refreshStationGrid();
});
TcHmi.EventProvider.register('Desktop.onAttached', () => {
    refreshStationGrid();
});
// To Write Back PLC Array when Data changed;
TcHmi.EventProvider.register('TcHmiDatagridStationRecipe.onDataChanged', (_event, change) => {
    if (isRefreshingStationGrid)
        return;
    const grid = TcHmi.Controls.get('TcHmiDatagridStationRecipe');
    if (!grid)
        return;
    const editedRows = toArray(grid.getSrcData());
    const changedRowIndex = Number(change?.index);
    const changedProperty = change?.property;
    if (!Number.isInteger(changedRowIndex) || changedRowIndex < 0 || !changedProperty) {
        return;
    }
    const changedRow = editedRows[changedRowIndex];
    if (!changedRow)
        return;
    fullStationRows[changedRowIndex] = changedRow;
    const changedValue = changedRow[changedProperty];
    const changedFieldExpr = `%s%PLC1.GVL_VisuControlHMI.aDataGridStationRecipe[${changedRowIndex}].${changedProperty}%/s%`;
    TcHmi.Symbol.writeEx(changedFieldExpr, changedValue, data => {
        if (data.error !== TcHmi.Errors.NONE) {
            console.warn('Station recipe field write failed.', changedFieldExpr, changedValue, data);
        }
    });
});
//# sourceMappingURL=DynamicDataGrid_StationRecipe.js.map