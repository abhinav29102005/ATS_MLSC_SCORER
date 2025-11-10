from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import time
import pymupdf
import spacy
import re
from datetime import datetime
import pandas as pd
from supabase import create_client, Client
import uuid
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import logging
import os

logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="MLSC Competition Portal API",
    description="Perfect CV Match 2025 - Microsoft Learn Student Chapter @ TIET",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
nlp = None
supabase: Client = None
last_submissions = {}
MAX_UPLOADS = 5
RATE_LIMIT_SECONDS = 30

# Initialize NLP and Supabase
@app.on_event("startup")
async def startup_event():
    global nlp, supabase
    
    # Load spaCy model
    try:
        nlp = spacy.load("en_core_web_sm")
        logger.info("Spacy model loaded successfully")
    except OSError:
        logger.error("Spacy model not found. Please install: python -m spacy download en_core_web_sm")
    except Exception as e:
        logger.error(f"Error loading spacy: {e}")
    
    # Initialize Supabase
    try:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if url and key:
            supabase = create_client(url, key)
            logger.info("Supabase client initialized successfully")
        else:
            logger.error("Supabase credentials not found in environment variables")
    except Exception as e:
        logger.error(f"Supabase connection failed: {e}")

# Pydantic models
class ParticipantRegistration(BaseModel):
    name: str
    email: EmailStr
    mobile: str

class ParticipantResponse(BaseModel):
    id: str
    name: str
    email: str
    mobile: str
    upload_count: int
    message: Optional[str] = None

class ScoreResponse(BaseModel):
    score: float
    skills: List[str]
    experience_years: int
    matched_skills: List[str]
    feedback: List[str]
    penalties: List[str]
    plagiarism_score: float
    upload_count: int
    verdict: str

# Helper Functions
def validate_pdf_file(content: bytes, filename: str):
    if not filename.lower().endswith('.pdf'):
        return False, "File must be a PDF"
    
    if len(content) > 20 * 1024 * 1024:
        return False, "File size exceeds 20MB limit"
    
    return True, "Valid"

def extract_pdf_text(pdf_content: bytes):
    try:
        doc = pymupdf.open(stream=pdf_content, filetype="pdf")
        text = "".join([page.get_text() + "\n" for page in doc])
        doc.close()
        
        if not text.strip():
            raise Exception("PDF appears to be empty or contains only images")
        
        return text
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        raise Exception(f"PDF extraction error: {str(e)}")

def parse_resume(text):
    if not nlp:
        raise Exception("NLP model not available")
    
    if not text or len(text.strip()) < 100:
        raise Exception("Resume text is too short or empty")
    
    skills_list = [
        'Python', 'Java', 'JavaScript', 'SQL', 'AWS', 'Docker', 'Kubernetes',
        'React', 'Node.js', 'Django', 'Flask', 'PostgreSQL', 'MongoDB',
        'Machine Learning', 'Data Science', 'Git', 'CI/CD', 'Agile', 'Scrum',
        'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'TypeScript', 
        'Angular', 'Vue.js', 'Spring', 'TensorFlow', 'PyTorch', 'Pandas',
        'NumPy', 'Scikit-learn', 'Spark', 'Hadoop', 'Kafka', 'Redis',
        'Elasticsearch', 'GraphQL', 'REST API', 'Microservices', 'HTML',
        'CSS', 'Bootstrap', 'Tailwind', 'Azure', 'GCP', 'Jenkins', 'Ansible'
    ]
    
    text_lower = text.lower()
    skills = []
    seen_skills = set()
    
    for skill in skills_list:
        if skill.lower() in text_lower and skill.lower() not in seen_skills:
            skills.append(skill)
            seen_skills.add(skill.lower())
    
    experience_patterns = [
        r'(\d+)\+?\s*years?\s+(?:of\s+)?experience',
        r'experience[:\s]+(\d+)\+?\s*years?',
        r'(\d+)\+?\s*years?\s+in\s+',
        r'worked\s+for\s+(\d+)\+?\s*years?'
    ]
    
    experience_years = 0
    for pattern in experience_patterns:
        matches = re.findall(pattern, text_lower)
        if matches:
            exp_values = [int(m) for m in matches if int(m) <= 50]
            if exp_values:
                experience_years = max(experience_years, max(exp_values))
    
    projects_section = extract_section(text, ['project', 'projects'])
    education_section = extract_section(text, ['education', 'academic', 'qualification'])
    
    return {
        'skills': skills, 
        'experience_years': experience_years,
        'projects_section': projects_section,
        'education_section': education_section
    }

def extract_section(text, keywords):
    if not text:
        return ""
    
    lines = text.split('\n')
    section_text = ""
    capturing = False
    
    for i, line in enumerate(lines):
        line_lower = line.lower().strip()
        
        if any(kw in line_lower for kw in keywords):
            capturing = True
            continue
        
        if capturing and line_lower and line.strip().isupper() and len(line.strip()) < 50:
            break
            
        if capturing:
            section_text += line + "\n"
    
    return section_text.strip()

def validate_projects(projects_section, skills):
    if not projects_section or not skills:
        return 0, []
    
    projects_lower = projects_section.lower()
    verified_skills = [s for s in skills if s.lower() in projects_lower]
    verification_rate = len(verified_skills) / len(skills) if skills else 0
    
    return verification_rate, verified_skills

def validate_education(education_section, jd_education):
    score = 0
    penalties = []
    
    if not education_section:
        return 0, penalties
    
    edu_lower = education_section.lower()
    jd_lower = jd_education.lower() if jd_education else ""
    
    degrees = ['bachelor', 'b.tech', 'b.e.', 'bsc', 'master', 'm.tech', 'm.sc', 'phd', 'mba']
    jd_degrees = [d for d in degrees if d in jd_lower]
    resume_degrees = [d for d in degrees if d in edu_lower]
    
    if jd_degrees and resume_degrees:
        if any(jd_deg in resume_degrees for jd_deg in jd_degrees):
            score += 15
        else:
            score += 5  
    elif resume_degrees and not jd_degrees:
        score += 10  
    
    cgpa_pattern = r'(?:cgpa|gpa|grade)[:\s]*(\d+\.?\d*)\s*(?:/\s*(\d+\.?\d*))?'
    cgpa_matches = re.findall(cgpa_pattern, edu_lower)
    
    for match in cgpa_matches:
        try:
            cgpa_value = float(match[0])
            max_scale = float(match[1]) if match[1] else 10.0
            
            if max_scale <= 0:
                continue
            
            if cgpa_value > max_scale:
                penalties.append(f"Invalid CGPA: {cgpa_value}/{max_scale}")
                score -= 5
            elif cgpa_value == max_scale:
                penalties.append(f"Perfect CGPA claimed: {cgpa_value}/{max_scale}")
                score -= 2
            elif cgpa_value > (max_scale * 0.95):
                penalties.append(f"Suspiciously high CGPA: {cgpa_value}/{max_scale}")
                score -= 1
        except (ValueError, ZeroDivisionError):
            continue
    
    fields = [
        'computer science', 'software engineering', 'information technology', 
        'electrical engineering', 'electronics', 'data science', 'artificial intelligence'
    ]
    
    if jd_lower:
        jd_fields = [f for f in fields if f in jd_lower]
        resume_fields = [f for f in fields if f in edu_lower]
        
        if jd_fields and resume_fields:
            if any(jf in resume_fields for jf in jd_fields):
                score += 15
            else:
                score += 5
    
    return max(0, score), penalties

def check_plagiarism(resume_text, reference_corpus=None):
    if not reference_corpus or len(reference_corpus) == 0:
        return 0, "No reference data"
    
    try:
        if not resume_text or not resume_text.strip():
            return 0, "Empty resume"
        
        corpus = [resume_text] + reference_corpus
        
        if len(corpus) < 2:
            return 0, "Insufficient corpus"
        
        vectorizer = TfidfVectorizer(stop_words='english', ngram_range=(1, 2), max_features=1000)
        tfidf_matrix = vectorizer.fit_transform(corpus)
        
        similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:])
        max_similarity = float(np.max(similarities)) if similarities.size > 0 else 0.0
        plagiarism_score = round(max_similarity * 100, 2)
        
        return plagiarism_score, "Checked"
        
    except Exception as e:
        logger.error(f"Plagiarism check error: {e}")
        return 0, f"Error: {str(e)}"

def calculate_ats_score(resume_text, job_description, jd_education="", reference_corpus=None):
    if not resume_text or not job_description:
        raise Exception("Resume text and job description are required")
    
    if len(resume_text.strip()) < 100:
        raise Exception("Resume text is too short")
    
    if len(job_description.strip()) < 50:
        raise Exception("Job description is too short")
    
    try:
        parsed = parse_resume(resume_text)
    except Exception as e:
        raise Exception(f"Resume parsing failed: {str(e)}")
    
    score = 0
    feedback = []
    penalties = []
    
    jd_lower = job_description.lower()
    
    matched_skills = [s for s in parsed['skills'] if s.lower() in jd_lower]
    if parsed['skills']:
        skills_score = (len(matched_skills) / len(parsed['skills'])) * 40
        score += skills_score
        feedback.append(f"Matched {len(matched_skills)}/{len(parsed['skills'])} skills")
    else:
        feedback.append("No skills detected")
    
    exp_match = re.search(r'(\d+)\+?\s*years?', job_description.lower())
    required_exp = int(exp_match.group(1)) if exp_match else 2
    
    if required_exp == 0:
        required_exp = 1
    
    if parsed['experience_years'] >= required_exp:
        score += 20
        feedback.append(f"Experience: {parsed['experience_years']} years (meets requirement)")
    elif parsed['experience_years'] > 0:
        exp_score = min((parsed['experience_years'] / required_exp) * 20, 20)
        score += exp_score
        feedback.append(f"Experience: {parsed['experience_years']} years (below requirement)")
    else:
        feedback.append("No experience detected")
    
    project_verification, verified_skills = validate_projects(parsed['projects_section'], parsed['skills'])
    project_score = project_verification * 10
    score += project_score
    
    if project_verification > 0.7:
        feedback.append(f"Projects verified {len(verified_skills)} skills")
    elif project_verification > 0.3:
        feedback.append(f"Projects partially verified skills")
    else:
        feedback.append("Projects don't demonstrate claimed skills")
        penalties.append("Skills not verified in projects (-3 points)")
        score -= 3
    
    education_score, edu_penalties = validate_education(parsed['education_section'], jd_education)
    score += education_score
    penalties.extend(edu_penalties)
    
    if education_score > 20:
        feedback.append("Education strongly matches requirements")
    elif education_score > 10:
        feedback.append("Education partially matches requirements")
    else:
        feedback.append("Education doesn't match requirements")
    
    plagiarism_score = 0
    plag_status = "Not checked"
    
    if reference_corpus:
        plagiarism_score, plag_status = check_plagiarism(resume_text, reference_corpus)
        
        if plagiarism_score > 80:
            penalties.append(f"High plagiarism detected: {plagiarism_score}% (-20 points)")
            score -= 20
        elif plagiarism_score > 60:
            penalties.append(f"Moderate plagiarism detected: {plagiarism_score}% (-10 points)")
            score -= 10
        elif plagiarism_score > 40:
            penalties.append(f"Some plagiarism detected: {plagiarism_score}% (-5 points)")
            score -= 5
    
    feedback.append(f"Plagiarism check: {plagiarism_score}% similarity")
    
    if parsed['experience_years'] > 20:
        penalties.append("Unrealistic experience years (-10 points)")
        score -= 10
    
    for skill in parsed['skills'][:5]:
        count = resume_text.lower().count(skill.lower())
        if count > 15:
            penalties.append(f"Keyword stuffing detected: '{skill}' repeated {count} times (-5 points)")
            score -= 5
            break 
    
    final_score = max(0, min(score, 100))
    
    return {
        **parsed, 
        'score': round(final_score, 2),
        'matched_skills': matched_skills,
        'feedback': feedback,
        'penalties': penalties,
        'plagiarism_score': plagiarism_score
    }

def sanitize_input(text, max_length=500):
    if not text:
        return ""
    
    text = text.strip()[:max_length]
    text = re.sub(r'[<>"\';]', '', text)
    
    return text

def validate_email(email):
    if not email:
        return False
    
    email = email.strip().lower()
    email_pattern = r'^[a-zA-Z0-9._%+-]+@gmail\.com$'
    
    return re.match(email_pattern, email) is not None

def validate_mobile(mobile):
    if not mobile:
        return False
    
    mobile_clean = re.sub(r'[\s\-\+()]', '', mobile)
    
    if len(mobile_clean) < 10 or len(mobile_clean) > 15:
        return False
    
    return mobile_clean.isdigit()

def register_participant(name, email, mobile):
    if not supabase:
        return str(uuid.uuid4())
    
    try:
        name = sanitize_input(name, 200)
        email = sanitize_input(email, 200).lower()
        mobile = sanitize_input(mobile, 20)
        
        if not name or len(name) < 3:
            raise Exception("Invalid name")
        
        if not validate_email(email):
            raise Exception("Invalid email")
        
        if not validate_mobile(mobile):
            raise Exception("Invalid mobile number")
        
        participant_id = str(uuid.uuid4())
        data = {
            'id': participant_id,
            'name': name,
            'email': email,
            'mobile': mobile
        }
        supabase.table('participants').insert(data).execute()
        return participant_id
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise Exception(f"Registration error: {str(e)}")

def check_participant_exists(email):
    if not supabase:
        return None
    
    try:
        email = sanitize_input(email, 200).lower()
        response = supabase.table('participants').select('*').eq('email', email).execute()
        
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        logger.error(f"Check error: {e}")
        raise Exception(f"Error checking participant: {str(e)}")

def save_participant_application(score, skills, experience_years, participant_id):
    if not supabase:
        return False
    
    try:
        if not participant_id:
            raise Exception("Invalid participant ID")
        
        if not isinstance(score, (int, float)) or score < 0 or score > 100:
            raise Exception("Invalid score")
        
        data = {
            'participant_id': participant_id,
            'score': float(score),
            'skills_count': len(skills) if isinstance(skills, list) else 0,
            'experience_years': int(experience_years) if experience_years else 0
        }
        supabase.table('applications').insert(data).execute()
        return True
    except Exception as e:
        logger.error(f"Save error: {e}")
        raise Exception(f"Error saving application: {str(e)}")

def get_participant_upload_count(participant_id):
    if not supabase or not participant_id:
        return 0
    
    try:
        response = supabase.table('applications').select('id').eq('participant_id', participant_id).execute()
        return len(response.data) if response.data else 0
    except Exception as e:
        logger.error(f"Count error: {e}")
        return 0

def get_participant_scores(participant_id):
    if not supabase or not participant_id:
        return pd.DataFrame()
    
    try:
        response = supabase.table('applications').select('*').eq('participant_id', participant_id).order('created_at', desc=True).execute()
        
        if response.data:
            return pd.DataFrame(response.data)
        return pd.DataFrame()
    except Exception as e:
        logger.error(f"Scores error: {e}")
        return pd.DataFrame()

def get_leaderboard():
    if not supabase:
        return pd.DataFrame()
    
    try:
        response = supabase.table('applications').select('participant_id, score, skills_count, experience_years').execute()
        
        if not response.data:
            return pd.DataFrame()
        
        df = pd.DataFrame(response.data)
        
        df = df.loc[df.groupby('participant_id')['score'].idxmax()]
        df = df.sort_values('score', ascending=False).reset_index(drop=True)
        df['rank'] = range(1, len(df) + 1)
        
        participants = supabase.table('participants').select('id, email').execute()
        
        if participants.data:
            participants_df = pd.DataFrame(participants.data)
            df = df.merge(participants_df, left_on='participant_id', right_on='id', how='left')
            df = df.rename(columns={'experience_years': 'experience'})
            return df[['rank', 'email', 'score', 'skills_count', 'experience']].head(10)
        
        return df.head(10)
    except Exception as e:
        logger.error(f"Leaderboard error: {e}")
        return pd.DataFrame()

def get_competition_stats():
    if not supabase:
        return None
    
    try:
        apps = supabase.table('applications').select('score, experience_years').execute()
        participants = supabase.table('participants').select('id').execute()
        
        if not apps.data or not participants.data:
            return None
        
        df = pd.DataFrame(apps.data)
        
        stats = {
            'total_participants': len(participants.data),
            'avg_score': float(df['score'].mean()),
            'top_score': float(df['score'].max()),
            'high_scorers': int(len(df[df['score'] >= 80])),
            'score_distribution': [
                {'range': '0-60%', 'count': int(len(df[df['score'] < 60]))},
                {'range': '60-80%', 'count': int(len(df[(df['score'] >= 60) & (df['score'] < 80)]))},
                {'range': '80-100%', 'count': int(len(df[df['score'] >= 80]))}
            ],
            'experience_distribution': [
                {'range': '0-2 years', 'count': int(len(df[df['experience_years'] <= 2]))},
                {'range': '3-5 years', 'count': int(len(df[(df['experience_years'] >= 3) & (df['experience_years'] <= 5)]))},
                {'range': '6-8 years', 'count': int(len(df[(df['experience_years'] >= 6) & (df['experience_years'] <= 8)]))},
                {'range': '8+ years', 'count': int(len(df[df['experience_years'] > 8]))}
            ]
        }
        
        return stats
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return None

# API Routes
@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "active",
        "competition": "Perfect CV Match 2025",
        "organization": "Microsoft Learn Student Chapter @ TIET",
        "nlp_loaded": nlp is not None,
        "database_connected": supabase is not None
    }

@app.post("/api/register", response_model=ParticipantResponse)
async def api_register(participant: ParticipantRegistration):
    """Register a new participant or return existing participant"""
    
    # Validation
    if len(participant.name) < 3:
        raise HTTPException(status_code=400, detail="Name must be at least 3 characters")
    
    # if '@thapar.edu' not in participant.email.lower():
    #     raise HTTPException(
    #         status_code=400, 
    #         detail="Valid Thapar email required (must end with @thapar.edu)"
    #     )
    
    mobile_clean = participant.mobile.replace('+', '').replace(' ', '').replace('-', '')
    if len(mobile_clean) < 10:
        raise HTTPException(
            status_code=400, 
            detail="Valid mobile number required (at least 10 digits)"
        )
    
    try:
        # Check if participant exists
        existing = check_participant_exists(participant.email)
        
        if existing:
            participant_id = existing['id']
            upload_count = get_participant_upload_count(participant_id)
            return ParticipantResponse(
                id=participant_id,
                name=participant.name,
                email=participant.email,
                mobile=participant.mobile,
                upload_count=upload_count,
                message="Welcome back! You are already registered."
            )
        
        # Register new participant
        participant_id = register_participant(participant.name, participant.email, participant.mobile)
        
        if not participant_id:
            raise HTTPException(status_code=500, detail="Registration failed. Please try again.")
        
        return ParticipantResponse(
            id=participant_id,
            name=participant.name,
            email=participant.email,
            mobile=participant.mobile,
            upload_count=0,
            message="Registration Successful!"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/submit", response_model=ScoreResponse)
async def api_submit_resume(
    participant_id: str = Form(...),
    job_description: str = Form(...),
    resume: UploadFile = File(...)
):
    """Submit resume and get ATS score"""
    
    # Check if NLP is loaded
    if not nlp:
        raise HTTPException(
            status_code=503, 
            detail="NLP service not available. Please ensure spaCy model is installed."
        )
    
    # Check upload count
    upload_count = get_participant_upload_count(participant_id)
    if upload_count >= MAX_UPLOADS:
        raise HTTPException(
            status_code=400, 
            detail=f"Upload limit of {MAX_UPLOADS} reached"
        )
    
    # Rate limiting check
    current_time = time.time()
    if participant_id in last_submissions:
        time_since_last = current_time - last_submissions[participant_id]
        if time_since_last < RATE_LIMIT_SECONDS:
            wait_time = int(RATE_LIMIT_SECONDS - time_since_last)
            raise HTTPException(
                status_code=429, 
                detail=f"Please wait {wait_time} seconds before next submission"
            )
    
    # Read and validate file
    content = await resume.read()
    is_valid, message = validate_pdf_file(content, resume.filename)
    if not is_valid:
        raise HTTPException(status_code=400, detail=message)
    
    # Validate job description
    if not job_description or len(job_description.strip()) < 50:
        raise HTTPException(
            status_code=400, 
            detail="Job description must be at least 50 characters"
        )
    
    try:
        # Extract text from PDF
        text = extract_pdf_text(content)
        
        if not text or len(text.strip()) < 100:
            raise HTTPException(
                status_code=400, 
                detail="Could not extract sufficient text from PDF. Please ensure your resume contains readable text."
            )
        
        # Calculate ATS score
        result = calculate_ats_score(text, job_description)
        
        # Save application
        save_success = save_participant_application(
            result['score'],
            result['skills'],
            result['experience_years'],
            participant_id
        )
        
        if not save_success:
            raise HTTPException(status_code=500, detail="Failed to save application")
        
        # Update rate limiting
        last_submissions[participant_id] = current_time
        
        # Determine verdict
        score = result['score']
        if score >= 80:
            verdict = "Excellent Match"
        elif score >= 60:
            verdict = "Good Match"
        else:
            verdict = "Needs Improvement"
        
        return ScoreResponse(
            score=result['score'],
            skills=result['skills'],
            experience_years=result['experience_years'],
            matched_skills=result['matched_skills'],
            feedback=result['feedback'],
            penalties=result['penalties'],
            plagiarism_score=result['plagiarism_score'],
            upload_count=upload_count + 1,
            verdict=verdict
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing resume: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing resume: {str(e)}")

@app.get("/api/participant/{participant_id}/scores")
async def api_get_scores(participant_id: str):
    """Get all scores for a participant"""
    try:
        scores = get_participant_scores(participant_id)
        
        if scores.empty:
            return {
                "scores": [],
                "best_score": None,
                "total_submissions": 0
            }
        
        # Convert timestamps to string format
        scores_list = scores.to_dict('records')
        for score in scores_list:
            if 'created_at' in score:
                score['created_at'] = str(score['created_at'])
        
        best_score = float(scores['score'].max())
        
        return {
            "scores": scores_list,
            "best_score": best_score,
            "total_submissions": len(scores_list)
        }
    except Exception as e:
        logger.error(f"Error fetching scores: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching scores: {str(e)}")

@app.get("/api/participant/{participant_id}/upload-count")
async def api_get_upload_count(participant_id: str):
    """Get upload count for a participant"""
    try:
        count = get_participant_upload_count(participant_id)
        return {
            "upload_count": count,
            "max_uploads": MAX_UPLOADS,
            "remaining": MAX_UPLOADS - count
        }
    except Exception as e:
        logger.error(f"Error fetching upload count: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching upload count: {str(e)}")

@app.get("/api/leaderboard")
async def api_leaderboard():
    """Get top 10 leaderboard"""
    try:
        data = get_leaderboard()
        
        if data.empty:
            return {"leaderboard": []}
        
        return {"leaderboard": data.to_dict('records')}
    except Exception as e:
        logger.error(f"Error fetching leaderboard: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching leaderboard: {str(e)}")

@app.get("/api/stats")
async def api_stats():
    """Get competition statistics"""
    try:
        data = get_competition_stats()
        
        if not data or data.get('total_participants', 0) == 0:
            return {
                "total_participants": 0,
                "avg_score": 0,
                "top_score": 0,
                "high_scorers": 0,
                "score_distribution": [],
                "experience_distribution": []
            }
    finally:
        pass   
        return data