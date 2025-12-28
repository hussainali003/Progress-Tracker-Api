const getNextDate = (currentDate: Date) => {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + 1);
  return date;
};

export const getStreaks = (dates: Date[]) => {
  let nextDay = getNextDate(dates[0]);

  let tempStreak = 0;

  const streaks = [0];

  for (let i = 0; i < dates.length; i++) {
    if (i === 0 && i === dates.length - 1) {
      tempStreak++;
      streaks.push(tempStreak);
    } else if (i === 0) {
      tempStreak++;
      nextDay = getNextDate(dates[i]);
    } else if (
      new Date(nextDay).toISOString().slice(0, 10) === new Date(dates[i]).toISOString().slice(0, 10) &&
      i === dates.length - 1
    ) {
      tempStreak++;
      streaks.push(tempStreak);
    } else if (new Date(nextDay).toISOString().slice(0, 10) === new Date(dates[i]).toISOString().slice(0, 10)) {
      tempStreak++;
      nextDay = getNextDate(dates[i]);
    } else {
      streaks.push(tempStreak);
      tempStreak = 1;
      nextDay = getNextDate(dates[i]);
    }
  }

  return streaks;
};
