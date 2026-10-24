#!/usr/bin/env node
import {main} from '../../sciautoharness/scripts/check-harness-paths.mjs';
await main(process.argv.slice(2)).catch(e=>{console.log(JSON.stringify({ok:false,issues:[{code:'INVALID_ARGUMENTS',message:e.message}]}));process.exitCode=1;});
