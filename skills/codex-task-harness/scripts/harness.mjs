#!/usr/bin/env node
import {main} from '../../agent-task-harness/scripts/harness.mjs';
import {formatRuntimeError} from '../../agent-task-harness/scripts/lib/files.mjs';
await main().catch(e=>{console.error(formatRuntimeError(e));process.exitCode=1;});
