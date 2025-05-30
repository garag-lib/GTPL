const App = () => {
    const [tasks, setTasks] = React.useState([]);
    const [newTaskName, setNewTaskName] = React.useState('');
    const [newTaskPriority, setNewTaskPriority] = React.useState('Media');
    const [filterStatus, setFilterStatus] = React.useState('All');
    const [filterPriority, setFilterPriority] = React.useState('All');

    const generateInitialTasks = () => {
        const initialTasks = [];
        const priorities = ['Alta', 'Media', 'Baja'];
        for (let i = 1; i <= 50; i++) {
            initialTasks.push({
                id: Date.now() + i, // Simple unique ID generation
                nombre: `Task ${i}`,
                completada: Math.random() < 0.3, // Randomly mark some as completed
                prioridad: priorities[Math.floor(Math.random() * priorities.length)]
            });
        }
        setTasks(initialTasks);
    };

    React.useEffect(() => {
        generateInitialTasks();
    }, []);

    const addTask = () => {
        if (newTaskName.trim() === '') return;
        const newTask = {
            id: Date.now(),
            nombre: newTaskName,
            completada: false,
            prioridad: newTaskPriority
        };
        setTasks([...tasks, newTask]);
        setNewTaskName('');
        setNewTaskPriority('Media');
    };

    const deleteTask = (taskId) => {
        setTasks(tasks.filter(task => task.id !== taskId));
    };

    const toggleComplete = (taskId) => {
        setTasks(tasks.map(task =>
            task.id === taskId ? { ...task, completada: !task.completada } : task
        ));
    };

    const filteredTasks = tasks.filter(task => {
        let statusMatch = true;
        if (filterStatus === 'Completed') {
            statusMatch = task.completada;
        } else if (filterStatus === 'Incomplete') {
            statusMatch = !task.completada;
        }

        let priorityMatch = true;
        if (filterPriority !== 'All') {
            priorityMatch = task.prioridad === filterPriority;
        }
        return statusMatch && priorityMatch;
    });

    const totalTasks = tasks.length;
    const completedTasksCount = tasks.filter(task => task.completada).length;
    const incompleteTasksCount = totalTasks - completedTasksCount;

    return (
        <div>
            <h1>Dynamic Task List - React</h1>

            <div>
                <h2>Add Task</h2>
                <input
                    type="text"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="Task name"
                />
                <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                >
                    <option value="Alta">High</option>
                    <option value="Media">Medium</option>
                    <option value="Baja">Low</option>
                </select>
                <button onClick={addTask}>Add Task</button>
            </div>

            <div>
                <h2>Filters</h2>
                <label>Status: </label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="All">All</option>
                    <option value="Completed">Completed</option>
                    <option value="Incomplete">Incomplete</option>
                </select>
                <label>Priority: </label>
                <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                    <option value="All">All</option>
                    <option value="Alta">High</option>
                    <option value="Media">Medium</option>
                    <option value="Baja">Low</option>
                </select>
            </div>

            <div>
                <p>Total Tasks: {totalTasks}</p>
                <p>Completed Tasks: {completedTasksCount}</p>
                <p>Incomplete Tasks: {incompleteTasksCount}</p>
            </div>

            <div>
                <h2>Tasks</h2>
                <ul>
                    {filteredTasks.map(task => (
                        <li key={task.id} style={{ textDecoration: task.completada ? 'line-through' : 'none', color: task.completada ? '#aaa' : '#333' }}>
                            <input
                                type="checkbox"
                                checked={task.completada}
                                onChange={() => toggleComplete(task.id)}
                            />
                            <span>{task.nombre} - {task.prioridad}</span>
                            <button onClick={() => deleteTask(task.id)}>Delete</button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

ReactDOM.render(<App />, document.getElementById('root'));
