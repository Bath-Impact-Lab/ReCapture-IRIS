'use strict';

const { ipcMain } = require('electron');
const {
  runOpenSimScaleModel,
  runOpenSimIK,
  runOpenSimPipeline,
} = require('./opensimManager');

function wrapOpenSimHandler(task) {
  return async (_event, args = {}) => {
    try {
      return await task(args || {});
    } catch (error) {
      return { success: false, error: error.message };
    }
  };
}

function registerOpenSimIpc() {
  ipcMain.handle('opensim-scale-model', wrapOpenSimHandler(runOpenSimScaleModel));
  ipcMain.handle('opensim-run-ik', wrapOpenSimHandler(runOpenSimIK));
  ipcMain.handle('run-opensim', wrapOpenSimHandler(runOpenSimPipeline));
}

module.exports = {
  registerOpenSimIpc,
};
