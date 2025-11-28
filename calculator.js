// PVC Flute Calculator Logic
function calculate() {
    const tuning = document.querySelector('input[name="tuning"]:checked').value;
    const scale = document.querySelector('input[name="scale"]:checked').value;
    const fundamental = parseFloat(document.getElementById('fundamental').value);
    
    if (!fundamental || fundamental <= 0) {
        displayResults({ error: 'Please enter a valid fundamental frequency' });
        return;
    }
    
    const vSound = 343;
    const fList = [];
    const xList = [];
    
    // Calculate theoretical and real lengths
    const lTheory = vSound / (2 * fundamental);
    const lExtra = 1.2 * 0.01305;
    const lReal = lTheory - lExtra + 0.03;
    
    // Frequency calculation function
    function fN(n) {
        if (tuning === 'ET') {
            return fundamental * Math.pow(2, n / 12);
        } else if (tuning === 'JI') {
            const justRatios = {
                1: 16/15, 2: 9/8, 3: 6/5, 4: 5/4, 5: 4/3, 
                6: 45/32, 7: 3/2, 8: 8/5, 9: 5/3, 10: 9/5, 11: 15/8
            };
            return fundamental * justRatios[n];
        }
    }
    
    // Scale selection
    const major = [2, 4, 5, 7, 9, 11];
    const minor = [2, 3, 5, 7, 8, 10];
    const scaleSelection = scale === 'Major' ? major : minor;
    
    // Calculate frequencies
    for (let n of scaleSelection) {
        fList.push(fN(n));
    }
    
    // Calculate hole positions
    for (let x of fList) {
        const ratio = x / fundamental;
        xList.push(Math.round(((lTheory - lExtra) / ratio) * 100 * 100) / 100);
    }
    
    xList.reverse();
    
    displayResults({
        pipeLength: Math.round(lReal * 100 * 100) / 100,
        holePositions: xList,
        holeDiameter: 5
    });
}

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    
    if (results.error) {
        resultsDiv.innerHTML = '<div class="error">' + results.error + '</div>';
        resultsDiv.classList.add('show');
        return;
    }
    
    let holesHTML = results.holePositions.map((pos, i) => {
        return '<div>Hole ' + (i + 1) + ': <span>' + pos + ' cm</span></div>';
    }).join('');
    
    resultsDiv.innerHTML = 
        '<h3>Results</h3>' +
        '<div class="result-item">' +
            '<p><strong>Total Pipe Length:</strong> ' + results.pipeLength + ' cm</p>' +
        '</div>' +
        '<div class="result-item">' +
            '<p><strong>Hole Diameter:</strong> ' + results.holeDiameter + ' mm</p>' +
        '</div>' +
        '<div class="result-item">' +
            '<p><strong>Drill holes at these lengths from the centre of the embouchure:</strong></p>' +
            '<div class="hole-list">' + holesHTML + '</div>' +
        '</div>';
        
    resultsDiv.classList.add('show');
}