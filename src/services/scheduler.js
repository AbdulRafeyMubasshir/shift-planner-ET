// Helper function to get the shift type based on the station time
const getShiftType = (time) => {
  const startTime = parseInt(time.split('-')[0]);
  if (startTime >= 600 && startTime < 1400) {
    return 'Early';
  } else if (startTime >= 1400 && startTime < 2200) {
    return 'Late';
  } else {
    return 'Night';
  }
};

// Helper: Calculate shift duration in hours from "0800-1800" format
const getShiftDurationInHours = (time) => {
  const [start, end] = time.split('-').map(t => parseInt(t));
  const startHour = Math.floor(start / 100);
  const startMin = start % 100;
  const endHour = Math.floor(end / 100);
  const endMin = end % 100;

  const startInMinutes = startHour * 60 + startMin;
  const endInMinutes = endHour * 60 + endMin;

  let duration = (endInMinutes - startInMinutes) / 60;
  if (duration < 0) duration += 24; // Handle overnight shifts (e.g. 2200-0600)

  return duration;
};

// Helper: Get shift end time in minutes from "0800-1800"
const getShiftEndInMinutes = (time) => {
  const end = parseInt(time.split('-')[1]);
  const endHour = Math.floor(end / 100);
  const endMin = end % 100;
  return endHour * 60 + endMin;
};

// Helper: Get shift start time in minutes from "0800-1800"
const getShiftStartInMinutes = (time) => {
  const start = parseInt(time.split('-')[0]);
  const startHour = Math.floor(start / 100);
  const startMin = start % 100;
  return startHour * 60 + startMin;
};

// Days of the week in order
const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Scheduler function
const allocateWorkers = () => {
  const workersData = JSON.parse(localStorage.getItem('uploadedWorkers')) || [];
  const stationsData = JSON.parse(localStorage.getItem('uploadedStations')) || [];

  const workerAllocations = {};       // { workerId: [day, ...] }
  const workerShiftHistory = {};      // { workerId: { day: { shiftType, time } } }
  const workerTotalHours = {};        // { workerId: totalHours }

  const workers = JSON.parse(JSON.stringify(workersData));

  if (workers.length === 0) console.warn('No workers available for allocation.');
  if (stationsData.length === 0) console.warn('No stations available for allocation.');

  return stationsData.map((station) => {
    const shiftType = getShiftType(station.time);
    const shiftDurationHours = getShiftDurationInHours(station.time);
    const currentStartInMinutes = getShiftStartInMinutes(station.time);

    const eligibleWorkers = workers.filter((worker) => {
      const isAvailableOnDay = worker.availability
        .some((day) => day.toLowerCase() === station.day.toLowerCase());

      const prefersShift = worker.preferredShift.toLowerCase() === 'any' ||
        worker.preferredShift.toLowerCase() === shiftType.toLowerCase();

      const canWorkAtLocation = worker.canWorkStations
        .some((loc) => loc.toLowerCase() === station.location.toLowerCase());

      const isNotAllocatedForDay = !workerAllocations[worker.id]?.some(
        (day) => day.toLowerCase() === station.day.toLowerCase()
      );

      // 12-hour rest period check from previous day's end to today's start
      const todayIndex = daysOfWeek.findIndex(d => d.toLowerCase() === station.day.toLowerCase());
      const prevDay = todayIndex > 0 ? daysOfWeek[todayIndex - 1] : null;

      let hasEnoughRest = true;

      if (prevDay && workerShiftHistory[worker.id]?.[prevDay]) {
        const prevTime = workerShiftHistory[worker.id][prevDay].time;
        const prevEndInMinutes = getShiftEndInMinutes(prevTime);

        let diff = currentStartInMinutes - prevEndInMinutes;
        if (diff < 0) diff += 24 * 60;

        hasEnoughRest = diff >= 720; // 12 hours = 720 minutes

        /*if (!hasEnoughRest) {
          console.log(`⛔ ${worker.name} skipped on ${station.day} due to insufficient rest (${diff} minutes) after previous shift on ${prevDay}`);
        }*/
      }

      const currentHours = workerTotalHours[worker.id] || 0;
      const exceeds72HourLimit = currentHours + shiftDurationHours > 72;

      return (
        isAvailableOnDay &&
        prefersShift &&
        canWorkAtLocation &&
        isNotAllocatedForDay &&
        hasEnoughRest &&
        !exceeds72HourLimit
      );
    });

    eligibleWorkers.sort((a, b) => {
      return a.canWorkStations.indexOf(station.location) - b.canWorkStations.indexOf(station.location);
    });

    const bestWorker = eligibleWorkers[0];

    if (bestWorker) {
      if (!workerAllocations[bestWorker.id]) workerAllocations[bestWorker.id] = [];
      if (!workerShiftHistory[bestWorker.id]) workerShiftHistory[bestWorker.id] = {};
      if (!workerTotalHours[bestWorker.id]) workerTotalHours[bestWorker.id] = 0;

      workerAllocations[bestWorker.id].push(station.day);
      workerShiftHistory[bestWorker.id][station.day] = { shiftType, time: station.time };
      workerTotalHours[bestWorker.id] += shiftDurationHours;

      return {
        ...station,
        allocatedTo: bestWorker.name,
      };
    } else {
      return {
        ...station,
        allocatedTo: 'Unassigned',
      };
    }
  });
};

export default allocateWorkers;
