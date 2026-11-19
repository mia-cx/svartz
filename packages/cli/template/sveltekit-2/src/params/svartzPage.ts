// Plugin pages answer `<mount>/-/<name>/` only where a plugin claims <name>; every other path stays a note.
export { isPluginPageName as match } from 'virtual:svartz/host';
