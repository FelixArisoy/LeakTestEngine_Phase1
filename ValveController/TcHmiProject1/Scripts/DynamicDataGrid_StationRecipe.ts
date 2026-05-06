const stationDataExpr = '%s%PLC1.GVL_VisuControlHMI.aDataGridStationRecipe%/s%';
const stationCountExpr = '%s%PLC1.GVL_StationConfig.nNumOfActiveStations%/s%';

let fullStationRows: any[] = [];
let activeStationCount = 1;
let isRefreshingStationGrid = false;

function setStationGridDebug(value: object) {
    (window as any).ValiantStationGridDebug = {
        ...((window as any).ValiantStationGridDebug || {}),
        ...value
    };
}

function toArray(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort((left, right) => Number(left) - Number(right))
            .map(key => value[key]);
    }
    return [];
}

function refreshStationGrid() {
    const grid = TcHmi.Controls.get('TcHmiDatagridStationRecipe') as any;
    if (!grid) return;

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

new TcHmi.Symbol<any[]>(stationDataExpr).watch(data => {
    if (data.error !== TcHmi.Errors.NONE) return;

    fullStationRows = toArray(data.value);
    refreshStationGrid();
});

new TcHmi.Symbol<number>(stationCountExpr).watch(data => {
    if (data.error !== TcHmi.Errors.NONE) return;

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
    if (isRefreshingStationGrid) return;

    const grid = TcHmi.Controls.get('TcHmiDatagridStationRecipe') as any;
    if (!grid) return;

    const editedRows = toArray(grid.getSrcData());
    const changedRowIndex = Number(change?.index);
    const changedProperty = change?.property;

    if (!Number.isInteger(changedRowIndex) || changedRowIndex < 0 || !changedProperty) {
        setStationGridDebug({ lastIgnoredChange: change });
        return;
    }

    const changedRow = {
        ...(fullStationRows[changedRowIndex] || {}),
        ...(editedRows[changedRowIndex] || {}),
        [changedProperty]: change.value
    };

    fullStationRows[changedRowIndex] = changedRow;

    const changedValue = change.value;
    const changedFieldSymbol = `PLC1.GVL_VisuControlHMI.aDataGridStationRecipe[${changedRowIndex}]::${changedProperty}`;
    const changedRowSymbol = `PLC1.GVL_VisuControlHMI.aDataGridStationRecipe[${changedRowIndex}]`;

    setStationGridDebug({
        lastChange: change,
        lastWriteSymbol: changedFieldSymbol,
        lastWriteValue: changedValue,
        lastWriteState: 'pending'
    });

    TcHmi.Server.writeSymbol(changedFieldSymbol, changedValue, data => {
        if (data.error === TcHmi.Errors.NONE) {
            setStationGridDebug({ lastWriteState: 'field-ok', lastWriteResponse: data });
            console.info('Station recipe field write ok.', changedFieldSymbol, changedValue);
            return;
        }

        console.warn('Station recipe field write failed, trying row write.', changedFieldSymbol, changedValue, data);
        TcHmi.Server.writeSymbol(changedRowSymbol, changedRow, rowData => {
            const rowWriteOk = rowData.error === TcHmi.Errors.NONE;
            setStationGridDebug({
                lastWriteState: rowWriteOk ? 'row-ok' : 'failed',
                lastWriteResponse: rowWriteOk ? rowData : data,
                lastRowWriteResponse: rowData
            });

            if (rowWriteOk) {
                console.info('Station recipe row write ok.', changedRowSymbol, changedRow);
            } else {
                console.warn('Station recipe row write failed.', changedRowSymbol, changedRow, rowData);
            }
        });
    });
});
