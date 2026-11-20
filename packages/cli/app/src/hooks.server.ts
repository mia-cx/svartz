// Plugin requests under /_svartz/<id>/ answer before page handling; everything else passes through.
export { svartzHandle as handle } from 'virtual:svartz/server';
