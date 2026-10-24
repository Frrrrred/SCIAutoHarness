// Template versions are part of the reviewed contract, separate from state schema.
export const CURRENT_TEMPLATE_VERSION=4;
export const EXECUTION_SUMMARY='Process exit alone never verifies a task. On first factual closure, eligible ok results enter pending_acceptance, eligible failed results enter failed, and ineligible results are reported stale.';

export function templateVersion(contract){
  if(!Object.hasOwn(contract,'templateVersion'))return 1;
  if(![1,2,3,4].includes(contract.templateVersion))throw new Error('Unsupported templateVersion: use numeric 1, 2, 3 or 4; an omitted field preserves the frozen v1 template. Preserve original active runs and obtain a revised review before changing this field.');
  return contract.templateVersion;
}
