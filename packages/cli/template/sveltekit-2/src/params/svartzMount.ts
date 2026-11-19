// Plugin pages answer `<mount>/-/<name>/` only where a plugin of the vault at <mount> claims <name>; every other path stays a note.
export { isPluginPageMount as match } from 'virtual:svartz/host';
