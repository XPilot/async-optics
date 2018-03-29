const {
  performance,
  PerformanceObserver
} = require('perf_hooks');
const mod = require('module');
const path = require('path');
const deps = require(path.join(__dirname, './package.json')).dependencies;
const io = require('./server/socket.js');
const aggregate = {};
for(let i in deps){
	aggregate[i] = true
};
let hierarchyAggregate;

performance.maxEntries = process.env.pacmonMaxEntries || 1500

mod.Module.prototype.require =
  performance.timerify(mod.Module.prototype.require);
	require = performance.timerify(require);

const obs = new PerformanceObserver((list, observer) => {
  const entries = list.getEntries();
  let buffer;
  entries.forEach((entry, i) => {
  	if (aggregate[entry[0]]) {
  		aggregate[entry[0]] = [];
  		buffer = aggregate[entry[0]]
  		endTime = entry.startTime + entry.duration
  		buffer.push({
  			name: entry[0], 
  			startTime: entry.startTime, 
  			duration: entry.duration, 
  			endTime: endTime, 
  			totalTime: entry.duration, 
  			children: []
  		})
  	} else {
  		buffer[0].totalTime += entry.duration
  		endTime = entry.startTime + entry.duration
  		buffer.push({
  			name: entry[0], 
  			startTime: entry.startTime, 
  			duration: entry.duration, 
  			endTime: endTime, 
  			totalTime: entry.duration, 
  			children: null
  		})
  	}
  });
  hierarchyAggregate = createHierarchy(aggregate)
  obs.disconnect();
  performance.clearFunctions();
});

obs.observe({ entryTypes: ['function'], buffered: true });

gatherAggregate();

io.on('connection', (socket) => {
	socket.emit('packageInfo', hierarchyAggregate);
});


function gatherAggregate(){
	for(let i in deps){
		require(i)
	}
}

function createHierarchy(data){
	const d3Data = {name: 'root', children: []};
	let hierarchy = {};
	let stack = [];
	for (let i in data) {
		hierarchy[i] = {
			name: i, 
			startTime: data[i][0].startTime,
			duration: data[i][0].duration,
			totalTime: data[i][0].totalTime,
			endTime: data[i][0].endTime,
			children: [] 
		};

		for (let j = 1; j < data[i].length; j++) {
		  if (stack.length === 0) {
		    stack.push(data[i][j]);
		    j++;
		  }

			let currParent = stack[stack.length - 1]
			if (data[i][j] && data[i][j].startTime >= currParent.startTime && 
				data[i][j].endTime < currParent.endTime) {
				stack.push(data[i][j]);
			} else {
			  const temp = stack.pop();
			  if (stack.length > 0) {
			  	if (stack[stack.length - 1].children === null) {
			  		stack[stack.length - 1].children = [];
			  	}
			  	stack[stack.length - 1].children.push(temp);
			  } else {
			  	hierarchy[i].children.push(temp);
			  }
			  stack.push(data[i][j]);
			}
		}

		checkStack(stack, hierarchy[i])
		d3Data.children.push(hierarchy[i])
	}
	return d3Data
}

function checkStack(stack, currHierarchy){
	while (stack.length !== 0) {
	  if (stack.length === 1) {
	  	let temp = stack.pop();
	  	if (!temp) break;
	  	else currHierarchy.children.push(temp);
	  } else {
	    let temp = stack.pop();
	    for (let k = stack.length - 1; k >= 0; k--) {
	      if (temp !== null && temp.startTime >= stack[k].startTime && temp.endTime < stack[k].endTime) {
	      	if(stack[k].children === null) {
	      		stack[k].children = [];
	      	}
	        stack[k].children.push(temp);
	        stack[k].totalTime += temp.totalTime;
	        temp = undefined;
	        break;
	      }
	    }
	    if (temp) currHierarchy.children.push(temp);
	  }
	}	
}