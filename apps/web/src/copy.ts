import type { ItemInput } from "@homer/shared";

const addItem = "Add item";
const editItem = (name: string) => `Edit ${name}`;

const common = {
  cancel: "Cancel",
  save: "Save",
  boughtIt: "Bought it",
  nobody: "Nobody",
};

export const copy = {
  common,

  brand: {
    name: "HOMER",
  },

  nav: {
    label: "Main",
    items: "Items",
    groceries: "Groceries",
    schedule: "Schedule",
    people: "People",
  },

  schedule: {
    title: "Schedule",
    loading: "Loading the schedule.",
    loadFailed: "Couldn't load the schedule. Check that the api is running, then refresh.",
    addTask: "Add task",
    addEvent: "Add event",
    eventLabel: "Event",
    person: "Person",
    everyone: "Everyone",
    overdue: "Overdue",
    today: "Today",
    tomorrow: "Tomorrow",
    viewLabel: "View",
    todayView: "Today",
    weekView: "Week",
    nothingThisDay: "Nothing planned.",
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    dayName: (weekday: string, day: number, month: string) => `${weekday} ${day} ${month}`,
    relativeDay: (relative: string, name: string) => `${relative}, ${name}`,
    anytime: "Anytime",
    empty: "Nothing planned. Add a task or an event.",
    nothingForPerson: (name: string) => `Nothing planned for ${name}.`,
    thisPerson: "this person",
    showEveryone: "Show everyone",
    done: "Done",
    edit: "Edit",
    editLabel: (title: string) => `Edit ${title}`,
    overdueBy: (days: number) => `${days} ${days === 1 ? "day" : "days"} overdue`,
    repeats: { daily: "Repeats daily", weekly: "Repeats weekly", monthly: "Repeats monthly" },
  },

  taskForm: {
    addTitle: "Add task",
    editTitle: (title: string) => `Edit ${title}`,
    title: "What needs doing",
    dueDate: "Due date (blank for anytime)",
    dueTime: "Time (optional)",
    repeat: "Repeat",
    noRepeat: "Doesn't repeat",
    repeatOptions: { daily: "Every day", weekly: "Every week", monthly: "Every month" },
    person: "Assigned to",
    removeTask: "Remove task",
    confirmRemove: (title: string) => `Remove ${title}? It is hidden, and can't be brought back here.`,
    blankTitle: "Enter what needs doing.",
  },

  eventForm: {
    addTitle: "Add event",
    editTitle: (title: string) => `Edit ${title}`,
    title: "What's happening",
    date: "Date",
    time: "Time (optional)",
    person: "Assigned to",
    removeEvent: "Remove event",
    confirmRemove: (title: string) => `Remove ${title}? It is hidden, and can't be brought back here.`,
    blankTitle: "Enter what's happening.",
  },

  people: {
    title: "People",
    addLabel: "Add a person",
    add: "Add",
    loading: "Loading people.",
    loadFailed: "Couldn't load people. Check that the api is running, then refresh.",
    empty: "No one yet. Add the people in your household.",
    rename: "Rename",
    renameLabel: (name: string) => `Rename ${name}`,
    nameLabel: "Name",
    blankName: "Enter a name.",
  },

  stock: {
    outOfIt: "Out of it",
    noEstimate: "No estimate",
    runsOutToday: "Runs out today",
    runsOutIn: (days: number) => `Runs out in ${days} ${days === 1 ? "day" : "days"}`,
  },

  items: {
    title: "Items",
    addItem,
    loading: "Loading items.",
    loadFailed: "Couldn't load items. Check that the api is running, then refresh.",
    actionFailed: (message: string) => `${message} Refresh the list and try again.`,
    empty: "No items yet. Add something you don't want to run out of.",
    confirmRemove: (name: string) => `Remove ${name}? Its restock history is kept.`,
    onGroceryList: "On the grocery list",
    edit: "Edit",
    editLabel: editItem,
    estimateSource: { entered: "Entered by hand", learned: "Learned from restocks" },
  },

  itemForm: {
    addTitle: addItem,
    editTitle: editItem,
    name: "Name",
    unit: "Unit (bag, litre)",
    quantity: "Quantity",
    daysPerUnit: "Lasts (days per unit, blank if unknown)",
    lowThresholdDays: "Low at (days left)",
    removeItem: "Remove item",
    fixFields: (fields: string) => `Fix these fields, then save again: ${fields}.`,
    wholeForm: "Form",
    invalidFields: {
      name: "Name (required)",
      unit: "Unit (required)",
      quantity: "Quantity (0 or more)",
      daysPerUnit: "Lasts (a number above 0, or blank)",
      lowThresholdDays: "Low at (0 or more)",
    } satisfies Record<keyof ItemInput, string>,
  },

  restockDialog: {
    title: (name: string) => `Bought ${name}`,
    quantityBought: (unit: string) => `Quantity bought (${unit})`,
    invalidQuantity: "Enter a quantity above 0.",
  },

  restoreChoice: {
    title: (name: string) => `${name} was removed before`,
    explanation: "Restore it to get its restock history back, or start a new item with an empty history.",
    restore: (name: string) => `Restore ${name}`,
    startNew: "Start a new item",
  },

  groceries: {
    title: "Groceries",
    addLabel: "Add to the list",
    add: "Add",
    loading: "Loading the list.",
    loadFailed: "Couldn't load the list. Check that the api is running, then refresh.",
    empty: "Nothing to buy. Items that run low show up here.",
    remove: "Remove",
    addedAutomatically: "Added automatically",
    addedByHand: "Added by hand",
    defaultUnit: "units",
  },
};
