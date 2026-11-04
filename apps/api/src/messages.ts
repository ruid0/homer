export const messages = {
  nameTaken: (name: string) => `${name} is already tracked. Edit that item instead.`,
  itemNotFound: "That item doesn't exist. Refresh the list.",
  entryClosed: "That entry is already off the list. Refresh the list.",
  quantityNeeded: "Enter how much you bought.",
  personNameTaken: (name: string) => `${name} is already in the household. Use another name.`,
  personNotFound: "That person doesn't exist. Refresh the list.",
  eventRemoved: "That event is already removed. Refresh the list.",
  taskClosed: "That task is already done or removed. Refresh the list.",
};

// Read by the model, not shown to people.
export const toolMessages = {
  rangeBackwards: "The end date is before the start date. Swap them.",
  rangeTooLong: (max: number) => `Ask for at most ${max} days at a time.`,
};
