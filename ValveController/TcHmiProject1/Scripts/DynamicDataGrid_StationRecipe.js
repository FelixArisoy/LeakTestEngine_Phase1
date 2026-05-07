var maxStationCount = 10;
var stationCountExpr = '%s%PLC1.GVL_StationConfig.nNumOfActiveStations%/s%';
var stationRecipeExpr = '%s%PLC1.GVL_VisuControlHMI.aDataGridStationRecipe%/s%';
var activeStationCount = 1;
var selectedStationIndex = 0;
var selectedAteqRecipeExpr = '%s%PLC1.GVL_VisuControlHMI.aStationAteqRecipe[0]%/s%';
var selectedValveBankRecipeExpr = '%s%PLC1.GVL_VisuControlHMI.aStationValveBankRecipe[0]%/s%';
function clampStationCount(value) {
    var count = Number(value);
    if (!isFinite(count))
        return 1;
    count = count < 0 ? Math.ceil(count) : Math.floor(count);
    return Math.max(1, Math.min(maxStationCount, count));
}
function getControl(id) {
    return TcHmi.Controls.get(id);
}
function setText(id, text) {
    var control = getControl(id);
    if (control && typeof control.setText === 'function') {
        control.setText(text);
    }
}
function setVisibility(id, visible) {
    var control = getControl(id);
    if (control && typeof control.setVisibility === 'function') {
        control.setVisibility(visible ? 'Visible' : 'Collapsed');
    }
}
function bindDataSymbol(controlId, symbolExpression) {
    var grid = getControl(controlId);
    if (grid && typeof grid.setDataSymbol === 'function') {
        grid.setDataSymbol(new TcHmi.Symbol(symbolExpression));
    }
}
function getControlElement(control) {
    if (!control || typeof control.getElement !== 'function')
        return null;
    var elementList = control.getElement();
    if (!elementList || !elementList[0])
        return null;
    return elementList[0];
}
function toArray(value) {
    if (Array.isArray(value))
        return value.slice(0);
    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort(function (left, right) {
            return Number(left) - Number(right);
        })
            .map(function (key) {
            return value[key];
        });
    }
    return [];
}
function getParentTableCell(element) {
    var current = element;
    while (current) {
        if (current.tagName === 'TD')
            return current;
        current = current.parentElement;
    }
    return null;
}
function markStationTab(index, selected) {
    var button = getControl('TcHmiButtonStationTab' + index);
    var element = getControlElement(button);
    if (!element)
        return;
    element.style.outline = selected ? '2px solid #0078d4' : '';
    element.style.outlineOffset = selected ? '-2px' : '';
}
function selectStation(index) {
    selectedStationIndex = Math.max(0, Math.min(index, activeStationCount - 1));
    selectedAteqRecipeExpr = '%s%PLC1.GVL_VisuControlHMI.aStationAteqRecipe[' + selectedStationIndex + ']%/s%';
    selectedValveBankRecipeExpr = '%s%PLC1.GVL_VisuControlHMI.aStationValveBankRecipe[' + selectedStationIndex + ']%/s%';
    setText('TcHmiTextblockSelectedStation', 'Station ' + (selectedStationIndex + 1));
    bindDataSymbol('TcHmiDatagridAteqRecipe', selectedAteqRecipeExpr);
    bindDataSymbol('TcHmiDatagridValveBankRecipe', selectedValveBankRecipeExpr);
    for (var i = 0; i < maxStationCount; i++) {
        markStationTab(i, i === selectedStationIndex);
    }
}
function refreshStationTabs() {
    for (var i = 0; i < maxStationCount; i++) {
        setText('TcHmiButtonStationTab' + i, 'S' + (i + 1));
        setVisibility('TcHmiButtonStationTab' + i, i < activeStationCount);
    }
    if (selectedStationIndex >= activeStationCount) {
        selectedStationIndex = activeStationCount - 1;
    }
    selectStation(selectedStationIndex);
}
function initializeStationConfigHmi() {
    bindDataSymbol('TcHmiDatagridStationRecipe', stationRecipeExpr);
    attachToggleDomWriteBack('TcHmiDatagridStationRecipe', function () {
        return stationRecipeExpr;
    });
    attachToggleDomWriteBack('TcHmiDatagridAteqRecipe', function () {
        return selectedAteqRecipeExpr;
    });
    attachToggleDomWriteBack('TcHmiDatagridValveBankRecipe', function () {
        return selectedValveBankRecipeExpr;
    });
    refreshStationTabs();
}
function toBool(value) {
    return value === true || value === 1 || value === 'true' || value === 'True';
}
function writeBoolField(symbol, value) {
    TcHmi.Server.writeSymbol(symbol, toBool(value), function (data) {
        if (data.error !== TcHmi.Errors.NONE) {
            console.warn('Enable toggle write failed.', symbol, value, data);
        }
    });
}
function writeBoolInArray(symbolExpression, rowIndex, value) {
    var boolValue = toBool(value);
    TcHmi.Symbol.readEx2(symbolExpression, function (readData) {
        if (readData.error !== TcHmi.Errors.NONE) {
            console.warn('Enable array read failed.', symbolExpression, rowIndex, boolValue, readData);
            return;
        }
        var rows = toArray(readData.value);
        if (!rows[rowIndex]) {
            console.warn('Enable array row missing.', symbolExpression, rowIndex, readData.value);
            return;
        }
        rows[rowIndex].bEnabled = boolValue;
        TcHmi.Symbol.writeEx(symbolExpression, rows, function (writeData) {
            if (writeData.error !== TcHmi.Errors.NONE) {
                console.warn('Enable array write failed.', symbolExpression, rowIndex, boolValue, writeData);
            }
        });
    });
}
function attachToggleDomWriteBack(gridId, symbolExpressionGetter) {
    var grid = getControl(gridId);
    var element = getControlElement(grid);
    if (!element || element.__valiantToggleWriteBackAttached)
        return;
    element.__valiantToggleWriteBackAttached = true;
    element.addEventListener('change', function (event) {
        var target = event.target || event.srcElement;
        if (!target || target.tagName !== 'INPUT' || target.type !== 'checkbox')
            return;
        var cell = getParentTableCell(target);
        if (!cell)
            return;
        var columnIndex = Number(cell.getAttribute('data-column'));
        if (columnIndex !== 0)
            return;
        var rowIndex = Number(cell.getAttribute('data-row'));
        if (!isFinite(rowIndex) || rowIndex < 0)
            return;
        writeBoolInArray(symbolExpressionGetter(), Math.floor(rowIndex), target.checked);
    }, true);
}
function registerEnableWriteBack(gridId, symbolExpressionGetter) {
    TcHmi.EventProvider.register(gridId + '.onDataChanged', function (_event, change) {
        if (!change || change.property !== 'bEnabled')
            return;
        var rowIndex = Number(change.index);
        if (!isFinite(rowIndex) || rowIndex < 0)
            return;
        writeBoolInArray(symbolExpressionGetter(), Math.floor(rowIndex), change.value);
    });
}
for (var stationTabIndex = 0; stationTabIndex < maxStationCount; stationTabIndex++) {
    (function (index) {
        TcHmi.EventProvider.register('TcHmiButtonStationTab' + index + '.onPressed', function () {
            selectStation(index);
        });
    })(stationTabIndex);
}
registerEnableWriteBack('TcHmiDatagridStationRecipe', function () {
    return stationRecipeExpr;
});
registerEnableWriteBack('TcHmiDatagridAteqRecipe', function () {
    return selectedAteqRecipeExpr;
});
registerEnableWriteBack('TcHmiDatagridValveBankRecipe', function () {
    return selectedValveBankRecipeExpr;
});
new TcHmi.Symbol(stationCountExpr).watch(function (data) {
    if (data.error !== TcHmi.Errors.NONE)
        return;
    var nextCount = clampStationCount(data.value);
    activeStationCount = nextCount;
    if (nextCount !== Number(data.value)) {
        TcHmi.Symbol.writeEx(stationCountExpr, nextCount);
    }
    refreshStationTabs();
});
TcHmi.EventProvider.register('Desktop.onAttached', function () {
    initializeStationConfigHmi();
});
//# sourceMappingURL=DynamicDataGrid_StationRecipe.js.map