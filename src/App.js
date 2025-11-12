import React, { useState, useEffect } from 'react';
import "./App.css";
import apiService from './apiService';

const LoginPage = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !mobile) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.register(name, email, mobile);
      localStorage.setItem('participantId', response.id);
      localStorage.setItem('participantName', response.name);
      localStorage.setItem('participantEmail', response.email);
      onLogin(response);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="header">
        <div className="logo">
          <img src='/mlsc.png' height={60} alt="logo" />
        </div>
      </div>
      
      <div className="login-card">
        <h1 className="page-title">Perfect CV Match 2025</h1>
        <h2 className="section-title">Register / Login</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="Enter your full name"
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="email@example.com"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Mobile Number</label>
            <input 
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="input-field"
              placeholder="+91 XXXXX XXXXX"
              required
            />
          </div>
          
          <button 
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'REGISTERING...' : 'REGISTER / LOGIN'}
          </button>
        </form>
      </div>
    </div>
  );
};

const HomePage = ({ onNavigate, onLogout }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [jdEducation, setJdEducation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadCount, setUploadCount] = useState(0);
  const [scoreResult, setScoreResult] = useState(null);

  useEffect(() => {
    loadUploadCount();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUploadCount = async () => {
    try {
      const participantId = localStorage.getItem('participantId');
      if (!participantId) return;
      
      const data = await apiService.getUploadCount(participantId);
      setUploadCount(data.upload_count);
    } catch (err) {
      console.error('Failed to load upload count:', err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.pdf')) {
        setError('Only PDF files are allowed');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError('File size must be less than 20MB');
        return;
      }
      setSelectedFile(file);
      setError('');
      setSuccess('');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (!file.name.endsWith('.pdf')) {
        setError('Only PDF files are allowed');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError('File size must be less than 20MB');
        return;
      }
      setSelectedFile(file);
      setError('');
      setSuccess('');
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    setScoreResult(null);

    if (!selectedFile) {
      setError('Please select a PDF file');
      return;
    }

    if (!jobDescription || jobDescription.length < 50) {
      setError('Job description must be at least 50 characters');
      return;
    }

    if (uploadCount >= 5) {
      setError('You have reached the maximum upload limit (5)');
      return;
    }

    setLoading(true);
    try {
      const participantId = localStorage.getItem('participantId');
      const result = await apiService.submitResume(
        participantId, 
        selectedFile, 
        jobDescription,
        jdEducation
      );
      
      setSuccess(`Submission successful! Your ATS Score: ${result.score}%`);
      setScoreResult(result);
      setSelectedFile(null);
      setJobDescription('');
      setJdEducation('');
      await loadUploadCount();
    } catch (err) {
      setError(err.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="header">
        <div className="logo">
          <img src='/mlsc.png' alt='logo' height={60} />
        </div>
        <button className="logout-button" onClick={onLogout} title="Logout">⊗</button>
      </div>

      <div className="home-content-new">
        <div className="center-title">
          <h1 className="main-title">Perfect CV Match</h1>
          <p>Welcome, {localStorage.getItem('participantName')} | Uploads: {uploadCount}/5</p>
        </div>
        
        <div className="sidebar">
          <button className="nav-button active">HOME</button>
          <button className="nav-button" onClick={() => onNavigate('leaderboard')}>Leaderboard</button>
          <button className="nav-button" onClick={() => onNavigate('scores')}>My Scores</button>
        </div>

        <div className="upload-card">
          <label className="file-label">Upload Resume (PDF only)</label>
          
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          
          <div 
            className={`upload-area ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('fileInput').click()}
            role="button"
            tabIndex={0}
            onKeyPress={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                document.getElementById('fileInput').click();
              }
            }}
          >
            <div className="upload-icon">
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                <circle cx="30" cy="30" r="28" stroke="#ccc" strokeWidth="2" strokeDasharray="4 4"/>
                <path d="M30 20 L30 40 M20 30 L40 30" stroke="#999" strokeWidth="2"/>
              </svg>
            </div>
            <p className="upload-text">
              {selectedFile ? selectedFile.name : 'Drag & drop or click to upload'}
            </p>
            <input 
              id="fileInput"
              type="file" 
              onChange={handleFileChange}
              accept=".pdf"
              style={{ display: 'none' }}
            />
          </div>

          <textarea
            placeholder="Job Description (min 50 chars)" 
            className="link-input"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={4}
            style={{ resize: 'vertical', fontFamily: 'Courier New, monospace' }}
          />
          
          <input 
            type="text" 
            placeholder="Education Requirements (optional)" 
            className="link-input"
            value={jdEducation}
            onChange={(e) => setJdEducation(e.target.value)}
          />
          
          <button 
            className="submit-button" 
            onClick={handleSubmit}
            disabled={loading || uploadCount >= 5}
          >
            {loading ? 'Analyzing Resume...' : 'Submit & Get ATS Score'}
          </button>

          {scoreResult && (
            <div className="score-result">
              <h3>ATS Score: {scoreResult.score}% - {scoreResult.verdict}</h3>
              
              <div className="score-breakdown">
                <h4>Score Breakdown:</h4>
                <p>✓ Skills Match: {scoreResult.breakdown.skills_match}/30</p>
                <p>✓ Education: {scoreResult.breakdown.education}/20</p>
                <p>✓ Experience: {scoreResult.breakdown.experience}/20</p>
                <p>✓ Skills in Projects: {scoreResult.breakdown.projects}/15</p>
                <p>✓ Keyword Relevance: {scoreResult.breakdown.keyword_relevance}/10</p>
                <p>✓ Resume Quality: {scoreResult.breakdown.resume_quality}/5</p>
              </div>
              
              <p><strong>Detected Skills:</strong> {scoreResult.skills.length > 0 ? scoreResult.skills.join(', ') : 'None detected'}</p>
              <p><strong>Matched Skills:</strong> {scoreResult.matched_skills.length > 0 ? scoreResult.matched_skills.join(', ') : 'None matched'}</p>
              <p><strong>Experience:</strong> {scoreResult.experience_years} years</p>
              <p><strong>Keyword Similarity:</strong> {scoreResult.keyword_similarity}%</p>
              <p><strong>Plagiarism Score:</strong> {scoreResult.plagiarism_score}%</p>
              
              {scoreResult.feedback && scoreResult.feedback.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <h4>Feedback:</h4>
                  {scoreResult.feedback.map((item, idx) => (
                    <p key={idx}>• {item}</p>
                  ))}
                </div>
              )}
              
              {scoreResult.penalties && scoreResult.penalties.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <h4>Penalties:</h4>
                  {scoreResult.penalties.map((item, idx) => (
                    <p key={idx} style={{color: '#c62828'}}>⚠ {item}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MyScoresPage = ({ onNavigate, onLogout }) => {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bestScore, setBestScore] = useState(null);

  useEffect(() => {
    loadScores();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadScores = async () => {
    try {
      const participantId = localStorage.getItem('participantId');
      if (!participantId) {
        setLoading(false);
        return;
      }
      
      const data = await apiService.getParticipantScores(participantId);
      setScores(data.scores || []);
      setBestScore(data.best_score || null);
    } catch (err) {
      console.error('Failed to load scores:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="header">
        <div className="logo">
          <img src='/mlsc.png' alt='logo' height={60} />
        </div>
        <button className="logout-button" onClick={onLogout} title="Logout">⊗</button>
      </div>

      <div className="leaderboard-content">
        <div className="leaderboard-header">
          <button className="back-button" onClick={() => onNavigate('home')}>← Back to Home</button>
          <h1 className="leaderboard-title">My Scores</h1>
        </div>

        {bestScore !== null && bestScore > 0 && (
          <div className="best-score">
            <h2>Best Score: {bestScore}%</h2>
          </div>
        )}

        {loading ? (
          <p>Loading scores...</p>
        ) : scores.length === 0 ? (
          <p>No submissions yet. Upload your resume to get started!</p>
        ) : (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Score</th>
                <th>Skills</th>
                <th>Experience</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score, index) => (
                <tr key={score.id || index}>
                  <td>{index + 1}</td>
                  <td><strong>{score.score}%</strong></td>
                  <td>{score.skills_count || 0}</td>
                  <td>{score.experience_years || 0} yrs</td>
                  <td>{new Date(score.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const LeaderboardPage = ({ onNavigate, onLogout }) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLeaderboard = async () => {
    try {
      const data = await apiService.getLeaderboard();
      setLeaderboardData(data.leaderboard || []);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const getMedalEmoji = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  return (
    <div className="page-container">
      <div className="header">
        <div className="logo">
          <img src='/mlsc.png' alt='logo' height={60} />
        </div>
        <button className="logout-button" onClick={onLogout} title="Logout">⊗</button>
      </div>

      <div className="leaderboard-content">
        <div className="leaderboard-header">
          <button className="back-button" onClick={() => onNavigate('home')}>← Back to Home</button>
          <h1 className="leaderboard-title">Leaderboard</h1>
        </div>

        {loading ? (
          <p>Loading leaderboard...</p>
        ) : leaderboardData.length === 0 ? (
          <p>No submissions yet. Be the first to compete!</p>
        ) : (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Score</th>
                <th>Skills</th>
                <th>Experience</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardData.map((entry) => (
                <tr key={entry.rank || entry.email}>
                  <td>{entry.rank} {getMedalEmoji(entry.rank)}</td>
                  <td>{entry.name || entry.email}</td>
                  <td><strong>{entry.score}%</strong></td>
                  <td>{entry.skills_count || 0}</td>
                  <td>{entry.experience_years || entry.experience || 0} yrs</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [currentPage, setCurrentPage] = useState('login');

  useEffect(() => {
    // Check if user is already logged in
    const participantId = localStorage.getItem('participantId');
    if (participantId) {
      setCurrentPage('home');
    }
  }, []);

  const handleLogin = () => {
    setCurrentPage('home');
  };

  const handleLogout = () => {
    localStorage.clear();
    setCurrentPage('login');
  };

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="app">
      {currentPage === 'login' && <LoginPage onLogin={handleLogin} />}
      {currentPage === 'home' && <HomePage onNavigate={handleNavigate} onLogout={handleLogout} />}
      {currentPage === 'scores' && <MyScoresPage onNavigate={handleNavigate} onLogout={handleLogout} />}
      {currentPage === 'leaderboard' && <LeaderboardPage onNavigate={handleNavigate} onLogout={handleLogout} />}
    </div>
  );
};

export default App;