const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
});

export const formatSessionDate = (date: Date) => dateFormatter.format(date);

export const formatSessionMonth = (date: Date) => monthFormatter.format(date);

export const formatSessionTime = (date: Date) => timeFormatter.format(date);

export const formatSessionWeekday = (date: Date) => weekdayFormatter.format(date);
