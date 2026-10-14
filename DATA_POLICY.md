# Data and benchmark policy

Use newly authored synthetic messages for public issues, tests and examples. Names/phone-like numbers in authored fixtures are placeholders, not verified unassigned contacts; never call or message them. Retain format characteristics needed to reproduce a bug while replacing identity, phone, address, account, order and payment details.

The imported development set documents its sources and adaptations in `tools/ai-evaluation/datasets/development-v2.annotations.json`. User-provided formats had identities/contacts/streets replaced; commerce-pattern examples were newly authored, not copied customer conversations. Public URLs record inspiration, not permission to redistribute their content. Language/domain labels remain provisional until independently reviewed.

Do not commit real customer messages, credentials, `.env` files, model outputs from private inputs, private review exports, database backups, model weights or runtime binaries. Keep private datasets and raw runs OUTSIDE this checkout. `.gitignore` is only a convenience; review staged files before publishing. The automated public-content check catches known patterns, not every secret or identity.

Raw runs may contain original messages, quotations and extracted personal information. Never attach them to public issues or CI artifacts. Publish synthetic examples and aggregate reports only after review. Git history retains deleted content; removing an accidentally published file in a later commit is insufficient. Report exposure privately using SECURITY.md.

Public benchmark cases and repeatedly used development cases cannot establish unseen production accuracy. Keep translations and related templates in one split. Review phone, quantity and price failures separately, count rejected requests, and state missing evidence/measurement limitations. Dataset growth does not train the model.
