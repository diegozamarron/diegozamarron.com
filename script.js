// Navigation functionality
const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.section');

navButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetSection = button.getAttribute('data-section');
        showSection(targetSection);
    });
});

function showSection(sectionName) {
    // Hide all sections
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active state from all nav buttons
    navButtons.forEach(button => {
        button.classList.remove('active');
    });
    
    // Show target section
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Add active state to corresponding nav button
    const activeButton = document.querySelector(`[data-section="${sectionName}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

// Calculator view functions
function showCalculator() {
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    document.getElementById('calculator').classList.add('active');
}

function hideCalculator() {
    document.getElementById('calculator').classList.remove('active');
    document.getElementById('projects').classList.add('active');
}