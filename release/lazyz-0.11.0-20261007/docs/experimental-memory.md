# Experimental memory security gate

LazyZ does not load a memory runtime. `LAZYZ_EXPERIMENTAL_MEMORY=1` only asks
`lazyz doctor` to report the experiment's status; it cannot activate storage.

Any future implementation is restricted to repository-identity-isolated
`.omo/memory` state. User-global memory is prohibited. Shipping remains blocked
until redaction, export, deletion, backup, migration, locking, untrusted-input
quarantine, and prompt-injection defenses pass security review. Senpi memory is
not imported or bundled.
