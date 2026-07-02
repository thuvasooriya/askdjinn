- refine homescreen
  - [ ] add order tracking card (homescreen specific tool)
  - [ ] add carts card
- refine order tracking panel
  - [ ] mark the items that are done in the checking panel with a circular checkmark icon. (incompleted ones will be shown with blank circle i guess ) last completed one will be plusating.
  - [ ] reorder the items to show up from the latest to oldest. so last thing that happened will be displayed the first
- refine product details panel
  - [ ] cache product details properly
  - [ ] product image cors issues and fetch issues, thumbnail duplication
  - [ ] what the hell is the summary section for? show the description with good formatting
  - [ ] auto play for images is enabled by default in product details panel, when user manually clicks to a certain image the auto play will be turned off.
- refine products panel
  - [ ] do not display threads with no search results in product panel
- refine response bubble
  - [ ] bubble dismiss on manual click outside and show a handle like the ones shown in panels on top of the agent bar so that we can show the bubble or expand to chat (handle will be only shown when there is an existing history)
- refine agent personalities
- refine orb animations
  - [ ] different colors from the theme for each orb: orange, blue, green, pink
- refine prompts
  - [ ] don't say machan to people using english as setting
  - [ ] do not to nag the user to add something in cart.

- rewrite product details panel to show more images when available with image carrousal that shows the images in a loop and also have tools to view all images in a full screen slideshow. also variants need to be considered and added as well

-

- [ ] in addition to the summary allow the gemma-4-31b llm endpoint to suggest actions based on user details and list so that the actions shown in homescreen are always relevant and unique allow actions that prompts the main agent when clicked or just simple ui opening actions like track a specific order which will open that ui. or something. how do we implement this efficiently

- [ ] when chat panel input bar is focused don't minimize chat panel based on recency. chat panel will be pinned when chat panel input bar is focused. auto mimized chat panel should open the hover/floating mode of chat.

- [ ] auto scroll response bubble, reduce transparency

- [ ] bug: homescreen disappears when switching to live mode
- [ ] no need to show home button in bottom corner when actually in home
- [ ] add a confirmation popup to clear all data action
- [ ] distinct agent voices for each personality and consistent voice across sessions for a specific agent in live mode
- [ ] can the agent open randomly named panes? that's bad right? we should have a well defined list of verified panes. for example when information about orders is needed. agent should open orders pane and open the tracking of a specific order number when asked right? instead currently agent is showing weiered named panes with blank content and a done button. this should be culled
- [ ] doom loop prevention, max retries for same tool calls, auto termination for inactive live agent
- [x] bug: LLM text input from orb fixed — textarea now binds to input state, send button appears, Enter/click submits, verified in browser.
- [x] fix onboarding design to be modern and attractive — redesigned welcome, selection steps, and profile details flow.
- [x] djinn icon, description and cool animation, made with love in only srilanka make a wish button
- [x] language, personality, theme
- [x] memories - name gender allergies add more

- [x] better snappy smooth transitions for pane splits and changes — added panel/dock/mobile/conversation/product/home motion polish with reduced-motion handling.
- [x] when no panels are in display show home (hi i'm .. page and the prompts and stuff we'll improve it later), add an action called home in the options as well this will minimize all panes and goes home

- [x] remove the llm model choice in settings — settings now exposes theme only; provider/model selector UI and prop plumbing removed.
- [x] remember the last layout but when closing and opening the window again show the homescreen and show a button that can restore the last active panel layout — Home minimizes saved panels; dock now shows Restore Layout when minimized panels exist.
- [ ] and we'll be using the gemma-4-31b for a helper agent that routinely runs with a TTL when the user opens the browser and have some wishlist items. [partial: home summary bubble now uses gemma-4-31b every 24h/manual refresh to check saved liked/watch products and order tracking IDs via real MCP calls.]
- [ ] main agent can call this little djinn agent via a tool call and it will show the appropriate ui and give the information to main agent as well. usually this is a cron run using a TTL and only when user has closed the site and coming back to it

- [x] orders - fill in the example order by default allow adding new orders to track via id — VPAY827982BA seeded in session store; OrdersPanel with browse/detail/refresh; order_list and order_track tools.
- [ ] ttl for response bubbles, view the response bubble again with a chevron on top of the orb or input bar (chevron only shows when there is a session history)

- [ ] searching products with category filter is not returning any appropriate results but the tool is not giving proper instructions to try the search again or something because searching again without category seems to work

- [ ] how do we make the agent only recommend the products that are deliverable to the location the user wants and or or within the time that the user wants

- [x] add addressbook as another list — AddressBookPanel with full CRUD; address_list, address_add, address_remove, address_set_default tools.
- [x] showing the cost of delivery along with products in cart cost before checkout — deliveryEstimate wired from delivery_check into cart store + CartPanelContent renders subtotal + delivery + grand total.
- [ ] how do we view the checkout link. can we view it inside a panel as well?
- [x] can we get information about the tracking code or something? — OrdersPanel detail view shows full tracking timeline, recipient, amount, gift message, delivery comments.

- [ ] add the following themes to our web app
  - https://vscodethemes.com/e/snrico-moonlight.gruvbox-material-community/gruvbox-material-dark
  - https://vscodethemes.com/e/snrico-moonlight.gruvbox-material-community/gruvbox-material-light
  - https://coolors.co/palette/606c38-283618-fefae0-dda15e-bc6c25
  - https://coolors.co/palette/565264-706677-a6808c-ccb7ae-d6cfcb
