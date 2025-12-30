const getNextDate = (currentDate: Date) => {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + 1);
  return date;
};

export const getStreaks = (dates: Date[]) => {
  let nextDay = dates ? getNextDate(new Date()) : getNextDate(dates[0]);

  let tempStreak = 0;

  const streaks = [0];

  for (let i = 0; i < dates.length; i++) {
    if (i === 0 && i === dates.length - 1) {
      tempStreak++;
      streaks.push(tempStreak);
      nextDay = getNextDate(dates[i]);
    } else if (i === 0) {
      tempStreak++;
      nextDay = getNextDate(dates[i]);
    } else if (
      new Date(nextDay).toISOString().slice(0, 10) === new Date(dates[i]).toISOString().slice(0, 10) &&
      i === dates.length - 1
    ) {
      tempStreak++;
      streaks.push(tempStreak);
      nextDay = getNextDate(dates[i]);
    } else if (new Date(nextDay).toISOString().slice(0, 10) === new Date(dates[i]).toISOString().slice(0, 10)) {
      tempStreak++;
      nextDay = getNextDate(dates[i]);
    } else if (
      new Date(nextDay).toISOString().slice(0, 10) !== new Date(dates[i]).toISOString().slice(0, 10) &&
      i === dates.length - 1
    ) {
      streaks.push(tempStreak);
      tempStreak = 1;
      // first we push the tempStreak previous and then push last tempStreak
      streaks.push(tempStreak);
      nextDay = getNextDate(dates[i]);
    } else {
      streaks.push(tempStreak);
      tempStreak = 1;
      nextDay = getNextDate(dates[i]);
    }
  }

  // dates = [1,2,3,4,5, 24,25, 27,29] || [29] [28] [28,29]
  // error = [2,3,4,5, 28,29] || [2,3,4,5,6,29] solved

  console.log(streaks);

  if (nextDay < new Date()) {
    streaks.push(0);
  }

  return streaks;
};
