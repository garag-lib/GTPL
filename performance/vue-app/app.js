new Vue({
    el: '#app',
    data: {
        tasks: [],
        newTask: {
            name: '',
            priority: 'Media' // Default priority
        },
        filters: {
            status: 'All', // 'All', 'Completed', 'Incomplete'
            priority: 'All' // 'All', 'Alta', 'Media', 'Baja'
        }
    },
    computed: {
        totalTasks() {
            return this.tasks.length;
        },
        completedTasksCount() {
            return this.tasks.filter(task => task.completada).length;
        },
        incompleteTasksCount() {
            return this.tasks.filter(task => !task.completada).length;
        },
        filteredTasks() {
            let filtered = this.tasks;

            // Filter by status
            if (this.filters.status === 'Completed') {
                filtered = filtered.filter(task => task.completada);
            } else if (this.filters.status === 'Incomplete') {
                filtered = filtered.filter(task => !task.completada);
            }

            // Filter by priority
            if (this.filters.priority !== 'All') {
                filtered = filtered.filter(task => task.prioridad === this.filters.priority);
            }

            return filtered;
        }
    },
    methods: {
        generateInitialTasks() {
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
            this.tasks = initialTasks;
        },
        addTask() {
            if (this.newTask.name.trim() === '') return;

            this.tasks.push({
                id: Date.now(),
                nombre: this.newTask.name,
                completada: false,
                prioridad: this.newTask.priority
            });
            this.newTask.name = '';
            this.newTask.priority = 'Media'; // Reset priority
        },
        deleteTask(taskId) {
            this.tasks = this.tasks.filter(task => task.id !== taskId);
        }
        // Marking/unmarking is handled by v-model on the checkbox
    },
    created() {
        this.generateInitialTasks();
    }
});
