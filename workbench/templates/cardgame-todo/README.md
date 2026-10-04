# CardGame Todo

The UI preserves the original Todo note: compact quick entry and the expanded
three-column kanban, category filters, priorities, inline editing and delegation.
The CardGame adapter changes persistence, not the interaction model. Keep this
interface when adding backend capabilities; do not replace it with a list/detail
dashboard. Extra pages are loaded on request, with at most 500 cached items.

CardGame Todo keeps the durable requirements, priority, status, execution
feedback, and links to production requests for one configured project. The
list is read through the `cardgame-content` extension and remains paginated;
the note never copies the whole project into its state.

Editing a requirement uses its current revision. Execution feedback changes
only status, conclusion, and execution facts, so a result received after a
title or description edit cannot overwrite that edit. Creating a production
request saves a draft and opens the production note; it does not dispatch AI.
