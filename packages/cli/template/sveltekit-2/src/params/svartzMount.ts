// Plugin pages answer `<mount>/-/<name>/` only where a plugin claims <name>; every other path stays a note.
export { isPluginPageMount as match } from 'virtual:svartz/host';
