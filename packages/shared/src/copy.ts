export const schemaMessages = {
  invalidDate: "Enter a real date, like 2026-11-03.",
  invalidTime: "Enter a time like 09:30.",
  maintenanceNameLength: "Keep the name to 80 characters or fewer.",
  maintenanceSnoozeRange: "Pick a day after today, up to a year ahead.",
  maintenanceDateRange: "Pick a date from today back to a year ago.",
  dueDateNeeded: "Pick a due date first. A time or a repeat needs one.",
};

export const toolDescriptions = {
  list_items: "List every tracked item with its quantity, unit and days remaining. Changes nothing.",
  mark_out:
    "An item is used up: set its quantity to 0 and put it on the grocery list. Use the item's name. If it is not tracked, ask whether to start tracking it.",
  restock_item: "The household bought an item: add the quantity bought to what is in stock. Use the item's name.",
  add_item:
    "Start tracking a new item. Needs a name, a unit (bag, litre) and the quantity in stock now. daysPerUnit is how many days one unit lasts, if the person said so.",
  list_groceries: 'List what is on the grocery list now. Changes nothing. Use it for "what do we need?".',
  add_to_groceries: "Put something on the grocery list by hand. The name can be a tracked item or any text.",
  mark_bought: "Something on the grocery list was bought. A tracked item is also restocked by the quantity given.",
  list_tasks:
    "List tasks and events from a day to a day, each as today, tomorrow, a weekday name or YYYY-MM-DD. Leave both out for today. Changes nothing.",
  add_task:
    "Add a task. dueDate is today, tomorrow, a weekday name or YYYY-MM-DD, and is needed for a time or a repeat. person is the name of someone in the household. Never invent a date the person did not give.",
  add_event:
    "Add an event on a day (today, tomorrow, a weekday name or YYYY-MM-DD), with an optional HH:MM time and a person's name.",
  complete_task: "Mark an open task done by its title. A repeating task comes back at its next date.",
} as const;

export const toolErrors = {
  dateHint: "Use today, tomorrow, a weekday name, or a date like 2026-11-03.",
  unknownTool: (name: string, names: readonly string[]) =>
    `There is no tool called ${name}. Use one of: ${names.join(", ")}.`,
  invalidArguments: (name: string, problems: readonly string[]) =>
    `Invalid arguments for ${name}. ${problems.join(" ")}`,
  problem: (field: string, message: string) => `${field || "arguments"}: ${message}`,
};

export const mcpToolDescriptions: Record<
  | "list_due"
  | "complete_maintenance"
  | "snooze_maintenance"
  | "add_maintenance"
  | "update_item"
  | "remove_item"
  | "remove_from_groceries",
  string
> = {
  list_due:
    "What needs doing in the next days (default 7): maintenance that is overdue, due or coming up, routine rows still open today for everyone, and open tasks and events. Changes nothing.",
  complete_maintenance: "Mark a maintenance job done today, or on doneOn. Use the job's name.",
  snooze_maintenance: "Hide a maintenance job until tomorrow (the Upkeep page's Not today). Use the job's name.",
  add_maintenance:
    "Start a maintenance job that repeats every N weeks, months or years. lastDoneOn is optional; without it the first due date counts from today.",
  update_item:
    "Change a tracked item, found by its current name. Give only what changes: newName, unit, quantity (what is in stock now, set exactly; to add what was bought use restock_item), daysPerUnit (how many days one unit lasts; a new number makes HOMER learn the usage again) or lowThresholdDays.",
  remove_item:
    "Stop tracking an item (the app's Archive), found by its name. It also leaves the grocery list. Undo brings it back.",
  remove_from_groceries:
    "Take an entry off the grocery list without buying it, found by its name. A tracked item stays tracked, and goes back on the list while it is still low.",
};
