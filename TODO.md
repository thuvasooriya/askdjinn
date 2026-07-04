rewrite order-banner
render the pay buttons expiry and stuff in the orders pane
render the click to pay link inline

make the traffic lights smaller and move the expanded hover zone to a bit lower in all the panels

create order consistency

The application actually does have strict validations, but currently only for
form-collecting panels (like checkout and address-form). In your "Phase 5 Layout"
refactor, panel-contracts.ts was introduced. It acts as a strict schema/contract that both
the Agent and the UI must satisfy before a form is considered valid.

However, display panels (like order-tracking and product-detail) weren't strictly
validated by these contracts yet—they blindly trusted the caller (the agent or the UI) to
pass the correct payload. To bulletproof the app going forward, the next architectural
step would be to add requiredPayload schemas to panel-contracts.ts so ui.open()
immediately rejects or auto-fetches missing data instead of rendering an empty shell.

### refine homescreen

- [ ] add order tracking card (homescreen specific tool)
- [ ] add carts card

### refine order tracking panel

- [ ] mark the items that are done in the checking panel with a circular checkmark icon. (incompleted ones will be shown with blank circle i guess ) last completed one will be plusating.
- [ ] reorder the items to show up from the latest to oldest. so last thing that happened will be displayed the first

### refine product details panel

- [ ] cache product details properly
- [ ] product image cors issues and fetch issues, thumbnail duplication
- [ ] what the hell is the summary section for? show the description with good formatting
- [ ] auto play for images is enabled by default in product details panel, when user manually clicks to a certain image the auto play will be turned off.

### refine products panel

- [ ] do not display threads with no search results in product panel

### refine response bubble

- [ ] bubble dismiss on manual click outside and show a handle like the ones shown in panels on top of the agent bar so that we can show the bubble or expand to chat (handle will be only shown when there is an existing history)

### refine agent personalities

- [ ] consistent voice settings for a specific live agent?

### refine orb animations

- [ ] different colors from the theme for each orb: orange, blue, green, pink

### refine prompts

- [ ] don't say machan to people using english as setting
- [ ] do not to nag the user to add something in cart.

### safety and cleanup

- [ ] add a confirmation popup to clear all data action
- [ ] doom loop prevention, max retries for same tool calls, auto disconnect for inactive live agent

- [ ] ttl for response bubbles, view the response bubble again with a chevron on top of the orb or input bar (chevron only shows when there is a session history)

- [ ] searching products with category filter is not returning any appropriate results but the tool is not giving proper instructions to try the search again or something because searching again without category seems to work

- [ ] how do we make the agent only recommend the products that are deliverable to the location the user wants and or or within the time that the user wants

- [ ] how do we view the checkout link. can we view it inside a panel as well?
