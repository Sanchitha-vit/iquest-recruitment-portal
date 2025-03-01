 import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, get, update } from 'firebase/database';
import { database } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Domain } from '../types';
import toast from 'react-hot-toast';

interface Question {
  text: string;
  type: 'text' | 'radio' | 'checkbox';
  options?: string[];
}

interface Questionnaire {
  questions: Question[];
}

const Questionnaire = () => {
  const { domain } = useParams<{ domain: Domain }>();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    const checkEligibility = async () => {
      if (!currentUser || !domain) return;

      try {
        const userRef = ref(database, `users/${currentUser.uid}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
          toast.error('Please select your domains first');
          return navigate('/domain-selection');
        }

        const userData = userSnapshot.val();
        if (!userData.selectedDomains?.includes(domain)) {
          toast.error('You have not selected this domain');
          return navigate('/dashboard');
        }

        if (userData.quizzesAttempted?.[domain]) {
          toast.error('You have already completed this questionnaire');
          return navigate('/dashboard');
        }

        const questionsRef = ref(database, `questionnaires/${domain}`);
        const questionsSnapshot = await get(questionsRef);

        if (!questionsSnapshot.exists()) {
          toast.error('No questions found for this domain');
          return navigate('/dashboard');
        }

        const questionnaire = questionsSnapshot.val() as Questionnaire;
        setQuestions(questionnaire.questions);
        setLoading(false);
      } catch (error) {
        console.error('Error checking eligibility:', error);
        toast.error('Failed to load questionnaire');
        navigate('/dashboard');
      }
    };

    checkEligibility();
  }, [currentUser, domain, navigate]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const userStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = userStream;
        }
        setStream(userStream);
      } catch (error) {
        console.error('Error accessing camera:', error);
        toast.error('Camera access is required for the quiz');
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleResponseChange = (response: string) => {
    setResponses((prev) => ({
      ...prev,
      [`q${currentQuestion + 1}`]: response,
    }));
  };

  const handleSubmit = async () => {
    if (!currentUser || !domain) return;

    const unansweredQuestions = questions.filter(
      (_, index) => !responses[`q${index + 1}`] || responses[`q${index + 1}`].trim() === ''
    );

    if (unansweredQuestions.length > 0) {
      return toast.error('Please answer all questions before submitting');
    }

    try {
      setSubmitting(true);
      const updates: Record<string, any> = {
        [`users/${currentUser.uid}/quizzesAttempted/${domain}`]: true,
        [`responses/${currentUser.uid}/${domain}`]: {
          responses,
          timestamp: new Date().toISOString(),
        },
      };

      await update(ref(database), updates);
      toast.success('Questionnaire submitted successfully!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error submitting questionnaire:', error);
      toast.error('Failed to submit questionnaire');
    } finally {
      setSubmitting(false);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl text-white">Knowledge Assessment</h1>
      <div className="mb-4">
        <video ref={videoRef} autoPlay className="border border-green-500 w-64 h-48"></video>
      </div>
      <h2 className="text-lg text-white mb-4">{questions[currentQuestion]?.text}</h2>
      <textarea
        value={responses[`q${currentQuestion + 1}`] || ''}
        onChange={(e) => handleResponseChange(e.target.value)}
        className="w-full p-2 border rounded"
        placeholder="Type your answer here..."
      />
      <div className="mt-4 flex justify-between">
        <button onClick={() => setCurrentQuestion((prev) => prev - 1)} disabled={currentQuestion === 0} className="p-2 bg-gray-700 text-white rounded">Previous</button>
        {currentQuestion === questions.length - 1 ? (
          <button onClick={handleSubmit} className="p-2 bg-green-600 text-white rounded">Submit</button>
        ) : (
          <button onClick={() => setCurrentQuestion((prev) => prev + 1)} className="p-2 bg-blue-600 text-white rounded">Next</button>
        )}
      </div>
    </div>
  );
};

export default Questionnaire;
