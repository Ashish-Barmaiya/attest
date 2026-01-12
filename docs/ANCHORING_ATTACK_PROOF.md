# Anchoring Attack Simulation Report

## Executive Summary
This report documents a successful simulation of a "strong attacker" scenario where a malicious operator with full database access rewrites the audit history of a project. The simulation proves that internal hash chaining alone is insufficient to detect such attacks, while external anchoring successfully detects the tampering.

## Experiment Details
* Project ID: attack-proof-proj
* Total Events: 5
* Anchor Location: Sequence 5
* Anchor Directory: attack-anchors (Git-backed)

## Attack Execution
Setup: A project was created with 5 valid events. An anchor was written and committed to git at sequence 5.
Tampering: The payload of Event #3 was modified from value: 300 to value: 999999.
Rewrite: The attacker recomputed the hash chain from Event #3 to Event #5, updating payloadHash, prevChainHash, and chainHash for all affected events.
Cover-up: The chainHead in the database was updated to match the new tail hash.

## Verification Results
1. Internal Verification (verifyChain)
### Result
* PASS The internal verification logic confirmed that the hash chain is mathematically valid. All prevChainHash links and chainHash computations match the data currently in the database.

* This demonstrates that a malicious operator can completely bypass internal integrity checks by rewriting the chain.

2. External Verification (verifyAgainstAnchor)
### Result
* FAIL: The anchored verification logic compared the database state against the external anchor file.

* Expected Hash (Anchor): a843ff58068561456a8ef8d6f9b3b4de8e625f3e99d4b431309b842f863120db
* Actual Hash (Database): 8a4fc4ea45f6996449160e039cd70066687047514606078376f5fa0df1cbd3c10

* Error Message: Verification failed: Chain hash mismatch at sequence 5. Anchor: a843ff58..., History: 8a4fc4ea...

## Conclusion
Anchoring uniquely detected this attack. Without the external anchor, the database rewrite would have been indistinguishable from legitimate history. The mismatch between the immutable external anchor and the modified database state provided the definitive proof of tampering.