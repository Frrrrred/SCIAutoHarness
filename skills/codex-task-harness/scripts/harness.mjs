#!/usr/bin/env node
import {main} from '../../sciautoharness/scripts/harness.mjs';
import {formatRuntimeError} from '../../sciautoharness/scripts/lib/files.mjs';
await main().catch(e=>{console.error(formatRuntimeError(e));process.exitCode=1;});
