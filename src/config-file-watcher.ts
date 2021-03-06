import * as vscode from 'vscode';

import * as config from './config';

export function activate(context: vscode.ExtensionContext) {
  if (config.get<string>('onConfigChanged') != 'ignore') {
    const watcher = new ConfigFileWatcher(context);
  }
}

class ConfigFileWatcher {
  private databaseWatcher: vscode.FileSystemWatcher = undefined;

  constructor(private context: vscode.ExtensionContext) {
    this.createFileSystemWatcher();
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(
        () => { this.createFileSystemWatcher(); }));
  }

  createFileSystemWatcher() {
    if (this.databaseWatcher)
      this.databaseWatcher.dispose();
    this.databaseWatcher = vscode.workspace.createFileSystemWatcher(
        '{' +
        vscode.workspace.workspaceFolders.map(f => f.uri.fsPath).join(',') +
        '}/{build/compile_commands.json,compile_commands.json,compile_flags.txt,.clang-tidy}');
    this.context.subscriptions.push(this.databaseWatcher.onDidChange(
        this.handleConfigFilesChanged.bind(this)));
    this.context.subscriptions.push(this.databaseWatcher.onDidCreate(
        this.handleConfigFilesChanged.bind(this)));
    this.context.subscriptions.push(this.databaseWatcher);
  }

  async handleConfigFilesChanged(uri: vscode.Uri) {
    // Sometimes the tools that generate the compilation database, before
    // writing to it, they create a new empty file or they clear the existing
    // one, and after the compilation they write the new content. In this cases
    // the server is not supposed to restart
    if ((await vscode.workspace.fs.stat(uri)).size <= 0)
      return;

    switch (config.get<string>('onConfigChanged')) {
    case 'restart':
      vscode.commands.executeCommand('clangd.restart');
      break;
    case 'ignore':
      break;
    case 'prompt':
    default:
      switch (await vscode.window.showInformationMessage(
          `Clangd configuration file at '${
              uri.fsPath}' has been changed. Do you want to restart it?`,
          'Yes', 'Yes, always', 'No, never')) {
      case 'Yes':
        vscode.commands.executeCommand('clangd.restart');
        break;
      case 'Yes, always':
        vscode.commands.executeCommand('clangd.restart');
        config.update<string>('onConfigChanged', 'restart',
                              vscode.ConfigurationTarget.Global);
        break;
      case 'No, never':
        config.update<string>('onConfigChanged', 'ignore',
                              vscode.ConfigurationTarget.Global);
        break;
      default:
        break;
      }
      break;
    }
  }
}
