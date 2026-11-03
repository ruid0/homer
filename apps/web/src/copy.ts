const common = {
  cancel: "Cancel",
  save: "Save",
  boughtIt: "Bought it",
};

export const copy = {
  common,

  nav: {
    label: "Main",
    items: "Items",
    groceries: "Groceries",
  },

  stock: {
    outOfIt: "Out of it",
    noEstimate: "No estimate",
    runsOutToday: "Runs out today",
    runsOutIn: (days: number) => `Runs out in ${days} ${days === 1 ? "day" : "days"}`,
  },

  items: {
    title: "Items",
    addItem: "Add item",
    loading: "Loading items.",
    loadFailed: "Couldn't load items. Check that the api is running, then refresh.",
    actionFailed: (message: string) => `${message} Refresh the list and try again.`,
    empty: "No items yet. Add something you don't want to run out of.",
    confirmRemove: (name: string) => `Remove ${name}? Its restock history is kept.`,
    onGroceryList: "On the grocery list",
    edit: "Edit",
    editLabel: (name: string) => `Edit ${name}`,
    estimateSource: { entered: "Entered by hand", learned: "Learned from restocks" },
  },

  itemForm: {
    addTitle: "Add item",
    editTitle: (name: string) => `Edit ${name}`,
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
    } as Record<string, string>,
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
