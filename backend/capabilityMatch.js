/*
 * Structured JD <-> Resume capability matching engine.
 *
 * Pipeline (no external API, all dictionaries are local):
 *   JD / Resume text
 *     -> normalization
 *     -> controlled knowledge base (local dictionary)
 *     -> alias resolution & normalization
 *     -> phrase-level extraction (5-word ... 1-word, longest-first)
 *     -> contextual classification (negative contexts, section modes)
 *     -> category tagging + confidence scoring
 *   JD side additionally splits Required vs Preferred.
 *   Then JD requirements are compared category-by-category against the
 *   resume's structured candidate profile.
 */

// ---------------------------------------------------------------
// Controlled knowledge base: { term, display, category, confidence }
// term = normalized lookup key (lowercase, spaces). display = pretty name.
// ---------------------------------------------------------------

const CATEGORY_LABELS = {
  technical: 'Technical Skills',
  tools: 'Tools & Platforms',
  soft: 'Soft Skills',
  domain: 'Domain & Industry',
  education: 'Education',
  experience: 'Experience',
  certificates: 'Certifications',
  responsibilities: 'Responsibilities',
  other: 'Other Requirements',
};

const KB = [
  // --- Technical Skills ---
  { term: 'python', display: 'Python', category: 'technical', confidence: 0.99 },
  { term: 'java', display: 'Java', category: 'technical', confidence: 0.99 },
  { term: 'javascript', display: 'JavaScript', category: 'technical', confidence: 0.99 },
  { term: 'typescript', display: 'TypeScript', category: 'technical', confidence: 0.99 },
  { term: 'sql', display: 'SQL', category: 'technical', confidence: 0.99 },
  { term: 'pl/sql', display: 'PL/SQL', category: 'technical', confidence: 0.99 },
  { term: 'mysql', display: 'MySQL', category: 'technical', confidence: 0.98 },
  { term: 'postgresql', display: 'PostgreSQL', category: 'technical', confidence: 0.98 },
  { term: 'microsoft sql server', display: 'SQL Server', category: 'technical', confidence: 0.98 },
  { term: 'oracle', display: 'Oracle', category: 'technical', confidence: 0.95 },
  { term: 'mongodb', display: 'MongoDB', category: 'technical', confidence: 0.98 },
  { term: 'nosql', display: 'NoSQL', category: 'technical', confidence: 0.95 },
  { term: 'redis', display: 'Redis', category: 'technical', confidence: 0.95 },
  { term: 'c', display: 'C', category: 'technical', confidence: 0.9 },
  { term: 'c++', display: 'C++', category: 'technical', confidence: 0.98 },
  { term: 'c#', display: 'C#', category: 'technical', confidence: 0.98 },
  { term: '.net', display: '.NET', category: 'technical', confidence: 0.95 },
  { term: 'asp.net', display: 'ASP.NET', category: 'technical', confidence: 0.95 },
  { term: 'go', display: 'Go', category: 'technical', confidence: 0.9 },
  { term: 'golang', display: 'Go', category: 'technical', confidence: 0.95 },
  { term: 'rust', display: 'Rust', category: 'technical', confidence: 0.95 },
  { term: 'php', display: 'PHP', category: 'technical', confidence: 0.97 },
  { term: 'laravel', display: 'Laravel', category: 'technical', confidence: 0.96 },
  { term: 'ruby', display: 'Ruby', category: 'technical', confidence: 0.95 },
  { term: 'ruby on rails', display: 'Ruby on Rails', category: 'technical', confidence: 0.96 },
  { term: 'rails', display: 'Ruby on Rails', category: 'technical', confidence: 0.92 },
  { term: 'swift', display: 'Swift', category: 'technical', confidence: 0.96 },
  { term: 'kotlin', display: 'Kotlin', category: 'technical', confidence: 0.96 },
  { term: 'scala', display: 'Scala', category: 'technical', confidence: 0.95 },
  { term: 'dart', display: 'Dart', category: 'technical', confidence: 0.94 },
  { term: 'flutter', display: 'Flutter', category: 'technical', confidence: 0.96 },
  { term: 'react native', display: 'React Native', category: 'technical', confidence: 0.96 },
  { term: 'r programming', display: 'R', category: 'technical', confidence: 0.9 },
  { term: 'html', display: 'HTML', category: 'technical', confidence: 0.97 },
  { term: 'css', display: 'CSS', category: 'technical', confidence: 0.97 },
  { term: 'sass', display: 'Sass', category: 'technical', confidence: 0.94 },
  { term: 'tailwind css', display: 'Tailwind CSS', category: 'technical', confidence: 0.95 },
  { term: 'react', display: 'React', category: 'technical', confidence: 0.97 },
  { term: 'react js', display: 'React.js', category: 'technical', confidence: 0.96 },
  { term: 'angular', display: 'Angular', category: 'technical', confidence: 0.97 },
  { term: 'vue', display: 'Vue.js', category: 'technical', confidence: 0.95 },
  { term: 'vue js', display: 'Vue.js', category: 'technical', confidence: 0.95 },
  { term: 'next js', display: 'Next.js', category: 'technical', confidence: 0.96 },
  { term: 'node js', display: 'Node.js', category: 'technical', confidence: 0.97 },
  { term: 'node', display: 'Node.js', category: 'technical', confidence: 0.9 },
  { term: 'express', display: 'Express.js', category: 'technical', confidence: 0.96 },
  { term: 'express js', display: 'Express.js', category: 'technical', confidence: 0.95 },
  { term: 'nest js', display: 'NestJS', category: 'technical', confidence: 0.95 },
  { term: 'django', display: 'Django', category: 'technical', confidence: 0.97 },
  { term: 'flask', display: 'Flask', category: 'technical', confidence: 0.96 },
  { term: 'fastapi', display: 'FastAPI', category: 'technical', confidence: 0.96 },
  { term: 'spring boot', display: 'Spring Boot', category: 'technical', confidence: 0.96 },
  { term: 'spring', display: 'Spring', category: 'technical', confidence: 0.92 },
  { term: 'graphql', display: 'GraphQL', category: 'technical', confidence: 0.96 },
  { term: 'rest api', display: 'REST API', category: 'technical', confidence: 0.95 },
  { term: 'microservices', display: 'Microservices', category: 'technical', confidence: 0.95 },
  { term: 'web services', display: 'Web Services', category: 'technical', confidence: 0.9 },
  { term: 'docker', display: 'Docker', category: 'technical', confidence: 0.98 },
  { term: 'kubernetes', display: 'Kubernetes', category: 'technical', confidence: 0.98 },
  { term: 'terraform', display: 'Terraform', category: 'technical', confidence: 0.96 },
  { term: 'ansible', display: 'Ansible', category: 'technical', confidence: 0.95 },
  { term: 'jenkins', display: 'Jenkins', category: 'technical', confidence: 0.96 },
  { term: 'ci/cd', display: 'CI/CD', category: 'technical', confidence: 0.96 },
  { term: 'continuous integration', display: 'CI/CD', category: 'technical', confidence: 0.94 },
  { term: 'git', display: 'Git', category: 'technical', confidence: 0.96 },
  { term: 'github', display: 'GitHub', category: 'technical', confidence: 0.95 },
  { term: 'gitlab', display: 'GitLab', category: 'technical', confidence: 0.95 },
  { term: 'aws', display: 'AWS', category: 'technical', confidence: 0.97 },
  { term: 'amazon web services', display: 'AWS', category: 'technical', confidence: 0.97 },
  { term: 'aws ec2', display: 'AWS EC2', category: 'technical', confidence: 0.96 },
  { term: 'aws s3', display: 'AWS S3', category: 'technical', confidence: 0.96 },
  { term: 'aws lambda', display: 'AWS Lambda', category: 'technical', confidence: 0.96 },
  { term: 'azure', display: 'Microsoft Azure', category: 'technical', confidence: 0.97 },
  { term: 'microsoft azure', display: 'Microsoft Azure', category: 'technical', confidence: 0.97 },
  { term: 'google cloud', display: 'Google Cloud', category: 'technical', confidence: 0.96 },
  { term: 'gcp', display: 'Google Cloud', category: 'technical', confidence: 0.95 },
  { term: 'firebase', display: 'Firebase', category: 'technical', confidence: 0.95 },
  { term: 'snowflake', display: 'Snowflake', category: 'technical', confidence: 0.95 },
  { term: 'databricks', display: 'Databricks', category: 'technical', confidence: 0.95 },
  { term: 'apache spark', display: 'Apache Spark', category: 'technical', confidence: 0.96 },
  { term: 'spark', display: 'Apache Spark', category: 'technical', confidence: 0.9 },
  { term: 'hadoop', display: 'Hadoop', category: 'technical', confidence: 0.95 },
  { term: 'apache kafka', display: 'Apache Kafka', category: 'technical', confidence: 0.95 },
  { term: 'kafka', display: 'Kafka', category: 'technical', confidence: 0.92 },
  { term: 'rabbitmq', display: 'RabbitMQ', category: 'technical', confidence: 0.94 },
  { term: 'elasticsearch', display: 'Elasticsearch', category: 'technical', confidence: 0.94 },
  { term: 'kibana', display: 'Kibana', category: 'technical', confidence: 0.93 },
  { term: 'logstash', display: 'Logstash', category: 'technical', confidence: 0.93 },
  { term: 'airflow', display: 'Apache Airflow', category: 'technical', confidence: 0.94 },
  { term: 'mlflow', display: 'MLflow', category: 'technical', confidence: 0.92 },
  { term: 'tensorflow', display: 'TensorFlow', category: 'technical', confidence: 0.97 },
  { term: 'pytorch', display: 'PyTorch', category: 'technical', confidence: 0.97 },
  { term: 'keras', display: 'Keras', category: 'technical', confidence: 0.95 },
  { term: 'scikit-learn', display: 'scikit-learn', category: 'technical', confidence: 0.96 },
  { term: 'scikit learn', display: 'scikit-learn', category: 'technical', confidence: 0.96 },
  { term: 'pandas', display: 'pandas', category: 'technical', confidence: 0.95 },
  { term: 'numpy', display: 'NumPy', category: 'technical', confidence: 0.95 },
  { term: 'matlab', display: 'MATLAB', category: 'technical', confidence: 0.95 },
  { term: 'spss', display: 'SPSS', category: 'technical', confidence: 0.94 },
  { term: 'sas', display: 'SAS', category: 'technical', confidence: 0.94 },
  { term: 'machine learning', display: 'Machine Learning', category: 'technical', confidence: 0.99 },
  { term: 'deep learning', display: 'Deep Learning', category: 'technical', confidence: 0.98 },
  { term: 'artificial intelligence', display: 'Artificial Intelligence', category: 'technical', confidence: 0.99 },
  { term: 'natural language processing', display: 'NLP', category: 'technical', confidence: 0.97 },
  { term: 'computer vision', display: 'Computer Vision', category: 'technical', confidence: 0.96 },
  { term: 'data science', display: 'Data Science', category: 'technical', confidence: 0.97 },
  { term: 'data analysis', display: 'Data Analysis', category: 'technical', confidence: 0.96 },
  { term: 'data analytics', display: 'Data Analytics', category: 'technical', confidence: 0.96 },
  { term: 'data engineering', display: 'Data Engineering', category: 'technical', confidence: 0.96 },
  { term: 'data visualization', display: 'Data Visualization', category: 'technical', confidence: 0.96 },
  { term: 'analytics', display: 'Analytics', category: 'technical', confidence: 0.88 },
  { term: 'etl', display: 'ETL', category: 'technical', confidence: 0.94 },
  { term: 'data mining', display: 'Data Mining', category: 'technical', confidence: 0.92 },
  { term: 'big data', display: 'Big Data', category: 'technical', confidence: 0.94 },
  { term: 'statistical analysis', display: 'Statistical Analysis', category: 'technical', confidence: 0.93 },
  { term: 'algorithm', display: 'Algorithms', category: 'technical', confidence: 0.85 },
  { term: 'data structures', display: 'Data Structures', category: 'technical', confidence: 0.9 },
  { term: 'object-oriented programming', display: 'Object-Oriented Programming', category: 'technical', confidence: 0.92 },
  { term: 'oop', display: 'OOP', category: 'technical', confidence: 0.9 },
  { term: 'dbms', display: 'DBMS', category: 'technical', confidence: 0.9 },
  { term: 'rdbms', display: 'RDBMS', category: 'technical', confidence: 0.92 },
  { term: 'testing', display: 'Testing', category: 'technical', confidence: 0.82 },
  { term: 'qa', display: 'QA', category: 'technical', confidence: 0.88 },
  { term: 'selenium', display: 'Selenium', category: 'technical', confidence: 0.95 },
  { term: 'playwright', display: 'Playwright', category: 'technical', confidence: 0.94 },
  { term: 'cypress', display: 'Cypress', category: 'technical', confidence: 0.94 },
  { term: 'jest', display: 'Jest', category: 'technical', confidence: 0.94 },
  { term: 'junit', display: 'JUnit', category: 'technical', confidence: 0.93 },
  { term: 'testng', display: 'TestNG', category: 'technical', confidence: 0.92 },
  { term: 'unit testing', display: 'Unit Testing', category: 'technical', confidence: 0.9 },
  { term: 'cloud computing', display: 'Cloud Computing', category: 'technical', confidence: 0.95 },
  { term: 'linux', display: 'Linux', category: 'technical', confidence: 0.95 },
  { term: 'unix', display: 'Unix', category: 'technical', confidence: 0.92 },
  { term: 'shell scripting', display: 'Shell Scripting', category: 'technical', confidence: 0.92 },
  { term: 'bash', display: 'Bash', category: 'technical', confidence: 0.9 },
  { term: 'powershell', display: 'PowerShell', category: 'technical', confidence: 0.9 },
  { term: 'agile', display: 'Agile', category: 'domain', confidence: 0.9 },
  { term: 'scrum', display: 'Scrum', category: 'domain', confidence: 0.9 },
  { term: 'kanban', display: 'Kanban', category: 'domain', confidence: 0.85 },

  // --- Tools & Platforms ---
  { term: 'microsoft excel', display: 'Microsoft Excel', category: 'tools', confidence: 0.97 },
  { term: 'google sheets', display: 'Google Sheets', category: 'tools', confidence: 0.95 },
  { term: 'microsoft word', display: 'Microsoft Word', category: 'tools', confidence: 0.95 },
  { term: 'microsoft powerpoint', display: 'Microsoft PowerPoint', category: 'tools', confidence: 0.95 },
  { term: 'microsoft outlook', display: 'Microsoft Outlook', category: 'tools', confidence: 0.9 },
  { term: 'microsoft office', display: 'Microsoft Office', category: 'tools', confidence: 0.95 },
  { term: 'power bi', display: 'Power BI', category: 'tools', confidence: 0.97 },
  { term: 'tableau', display: 'Tableau', category: 'tools', confidence: 0.97 },
  { term: 'google analytics', display: 'Google Analytics', category: 'tools', confidence: 0.95 },
  { term: 'ga4', display: 'Google Analytics 4', category: 'tools', confidence: 0.92 },
  { term: 'mixpanel', display: 'Mixpanel', category: 'tools', confidence: 0.92 },
  { term: 'amplitude', display: 'Amplitude', category: 'tools', confidence: 0.92 },
  { term: 'hotjar', display: 'Hotjar', category: 'tools', confidence: 0.9 },
  { term: 'salesforce', display: 'Salesforce', category: 'tools', confidence: 0.96 },
  { term: 'hubspot', display: 'HubSpot', category: 'tools', confidence: 0.94 },
  { term: 'zoho', display: 'Zoho', category: 'tools', confidence: 0.9 },
  { term: 'sap', display: 'SAP', category: 'tools', confidence: 0.94 },
  { term: 'sap fico', display: 'SAP FICO', category: 'tools', confidence: 0.95 },
  { term: 'sap sd', display: 'SAP SD', category: 'tools', confidence: 0.95 },
  { term: 'sap mm', display: 'SAP MM', category: 'tools', confidence: 0.95 },
  { term: 'sap hana', display: 'SAP HANA', category: 'tools', confidence: 0.94 },
  { term: 'sap erp', display: 'SAP ERP', category: 'tools', confidence: 0.94 },
  { term: 'oracle erp', display: 'Oracle ERP', category: 'tools', confidence: 0.94 },
  { term: 'netsuite', display: 'NetSuite', category: 'tools', confidence: 0.93 },
  { term: 'odoo', display: 'Odoo', category: 'tools', confidence: 0.93 },
  { term: 'microsoft dynamics 365', display: 'Dynamics 365', category: 'tools', confidence: 0.94 },
  { term: 'power automate', display: 'Power Automate', category: 'tools', confidence: 0.92 },
  { term: 'power apps', display: 'Power Apps', category: 'tools', confidence: 0.92 },
  { term: 'vba', display: 'VBA', category: 'tools', confidence: 0.92 },
  { term: 'excel macros', display: 'Excel Macros', category: 'tools', confidence: 0.92 },
  { term: 'tally', display: 'Tally', category: 'tools', confidence: 0.95 },
  { term: 'quickbooks', display: 'QuickBooks', category: 'tools', confidence: 0.95 },
  { term: 'xero', display: 'Xero', category: 'tools', confidence: 0.93 },
  { term: 'zoho books', display: 'Zoho Books', category: 'tools', confidence: 0.93 },
  { term: 'jira', display: 'Jira', category: 'tools', confidence: 0.95 },
  { term: 'confluence', display: 'Confluence', category: 'tools', confidence: 0.93 },
  { term: 'trello', display: 'Trello', category: 'tools', confidence: 0.93 },
  { term: 'asana', display: 'Asana', category: 'tools', confidence: 0.93 },
  { term: 'slack', display: 'Slack', category: 'tools', confidence: 0.94 },
  { term: 'microsoft teams', display: 'Microsoft Teams', category: 'tools', confidence: 0.92 },
  { term: 'zoom', display: 'Zoom', category: 'tools', confidence: 0.9 },
  { term: 'figma', display: 'Figma', category: 'tools', confidence: 0.95 },
  { term: 'sketch', display: 'Sketch', category: 'tools', confidence: 0.93 },
  { term: 'adobe xd', display: 'Adobe XD', category: 'tools', confidence: 0.94 },
  { term: 'adobe photoshop', display: 'Adobe Photoshop', category: 'tools', confidence: 0.95 },
  { term: 'adobe illustrator', display: 'Adobe Illustrator', category: 'tools', confidence: 0.94 },
  { term: 'adobe premiere pro', display: 'Adobe Premiere Pro', category: 'tools', confidence: 0.93 },
  { term: 'after effects', display: 'After Effects', category: 'tools', confidence: 0.92 },
  { term: 'canva', display: 'Canva', category: 'tools', confidence: 0.92 },
  { term: 'autocad', display: 'AutoCAD', category: 'tools', confidence: 0.95 },
  { term: 'solidworks', display: 'SolidWorks', category: 'tools', confidence: 0.94 },
  { term: 'revit', display: 'Revit', category: 'tools', confidence: 0.93 },
  { term: 'blender', display: 'Blender', category: 'tools', confidence: 0.92 },
  { term: 'postman', display: 'Postman', category: 'tools', confidence: 0.93 },
  { term: 'swagger', display: 'Swagger', category: 'tools', confidence: 0.92 },
  { term: 'postman api', display: 'Postman', category: 'tools', confidence: 0.9 },
  { term: 'jmeter', display: 'JMeter', category: 'tools', confidence: 0.92 },
  { term: 'loadrunner', display: 'LoadRunner', category: 'tools', confidence: 0.9 },
  { term: 'wireshark', display: 'Wireshark', category: 'tools', confidence: 0.9 },
  { term: 'microsoft access', display: 'MS Access', category: 'tools', confidence: 0.9 },

  // --- Soft Skills ---
  { term: 'communication', display: 'Communication', category: 'soft', confidence: 0.94 },
  { term: 'communication skills', display: 'Communication Skills', category: 'soft', confidence: 0.96 },
  { term: 'verbal communication', display: 'Verbal Communication', category: 'soft', confidence: 0.94 },
  { term: 'written communication', display: 'Written Communication', category: 'soft', confidence: 0.94 },
  { term: 'presentation skills', display: 'Presentation Skills', category: 'soft', confidence: 0.93 },
  { term: 'public speaking', display: 'Public Speaking', category: 'soft', confidence: 0.94 },
  { term: 'interpersonal skills', display: 'Interpersonal Skills', category: 'soft', confidence: 0.95 },
  { term: 'teamwork', display: 'Teamwork', category: 'soft', confidence: 0.95 },
  { term: 'collaboration', display: 'Collaboration', category: 'soft', confidence: 0.92 },
  { term: 'team collaboration', display: 'Teamwork', category: 'soft', confidence: 0.93 },
  { term: 'leadership', display: 'Leadership', category: 'soft', confidence: 0.96 },
  { term: 'problem solving', display: 'Problem Solving', category: 'soft', confidence: 0.95 },
  { term: 'critical thinking', display: 'Critical Thinking', category: 'soft', confidence: 0.94 },
  { term: 'analytical thinking', display: 'Analytical Thinking', category: 'soft', confidence: 0.92 },
  { term: 'decision making', display: 'Decision Making', category: 'soft', confidence: 0.93 },
  { term: 'adaptability', display: 'Adaptability', category: 'soft', confidence: 0.94 },
  { term: 'flexibility', display: 'Flexibility', category: 'soft', confidence: 0.9 },
  { term: 'time management', display: 'Time Management', category: 'soft', confidence: 0.93 },
  { term: 'organizational skills', display: 'Organizational Skills', category: 'soft', confidence: 0.92 },
  { term: 'attention to detail', display: 'Attention to Detail', category: 'soft', confidence: 0.93 },
  { term: 'detail oriented', display: 'Detail Oriented', category: 'soft', confidence: 0.92 },
  { term: 'customer service', display: 'Customer Service', category: 'soft', confidence: 0.93 },
  { term: 'client handling', display: 'Client Handling', category: 'soft', confidence: 0.92 },
  { term: 'relationship management', display: 'Relationship Management', category: 'soft', confidence: 0.92 },
  { term: 'stakeholder management', display: 'Stakeholder Management', category: 'soft', confidence: 0.93 },
  { term: 'negotiation', display: 'Negotiation', category: 'soft', confidence: 0.92 },
  { term: 'conflict resolution', display: 'Conflict Resolution', category: 'soft', confidence: 0.93 },
  { term: 'mentoring', display: 'Mentoring', category: 'soft', confidence: 0.9 },
  { term: 'coaching', display: 'Coaching', category: 'soft', confidence: 0.9 },
  { term: 'team management', display: 'Team Management', category: 'soft', confidence: 0.93 },
  { term: 'people management', display: 'People Management', category: 'soft', confidence: 0.93 },
  { term: 'storytelling', display: 'Storytelling', category: 'soft', confidence: 0.88 },
  { term: 'creativity', display: 'Creativity', category: 'soft', confidence: 0.9 },
  { term: 'innovation', display: 'Innovation', category: 'soft', confidence: 0.88 },
  { term: 'ownership', display: 'Ownership', category: 'soft', confidence: 0.9 },
  { term: 'accountability', display: 'Accountability', category: 'soft', confidence: 0.91 },
  { term: 'reliability', display: 'Reliability', category: 'soft', confidence: 0.92 },
  { term: 'punctuality', display: 'Punctuality', category: 'soft', confidence: 0.9 },
  { term: 'work ethic', display: 'Work Ethic', category: 'soft', confidence: 0.91 },
  { term: 'positive attitude', display: 'Positive Attitude', category: 'soft', confidence: 0.92 },
  { term: 'proactive', display: 'Proactive', category: 'soft', confidence: 0.91 },
  { term: 'self-motivated', display: 'Self-Motivated', category: 'soft', confidence: 0.92 },
  { term: 'self starter', display: 'Self-Starter', category: 'soft', confidence: 0.92 },
  { term: 'motivation', display: 'Motivation', category: 'soft', confidence: 0.88 },
  { term: 'resilience', display: 'Resilience', category: 'soft', confidence: 0.91 },
  { term: 'emotional intelligence', display: 'Emotional Intelligence', category: 'soft', confidence: 0.93 },
  { term: 'empathy', display: 'Empathy', category: 'soft', confidence: 0.91 },
  { term: 'open-minded', display: 'Open-Minded', category: 'soft', confidence: 0.89 },
  { term: 'learning agility', display: 'Learning Agility', category: 'soft', confidence: 0.9 },
  { term: 'growth mindset', display: 'Growth Mindset', category: 'soft', confidence: 0.91 },
  { term: 'multitasking', display: 'Multitasking', category: 'soft', confidence: 0.89 },
  { term: 'prioritization', display: 'Prioritization', category: 'soft', confidence: 0.9 },
  { term: 'team player', display: 'Team Player', category: 'soft', confidence: 0.93 },
  { term: 'professionalism', display: 'Professionalism', category: 'soft', confidence: 0.92 },
  { term: 'initiative', display: 'Initiative', category: 'soft', confidence: 0.9 },

  // --- Domain & Industry ---
  { term: 'finance', display: 'Finance', category: 'domain', confidence: 0.94 },
  { term: 'accounting', display: 'Accounting', category: 'domain', confidence: 0.94 },
  { term: 'auditing', display: 'Auditing', category: 'domain', confidence: 0.92 },
  { term: 'taxation', display: 'Taxation', category: 'domain', confidence: 0.92 },
  { term: 'banking', display: 'Banking', category: 'domain', confidence: 0.93 },
  { term: 'insurance', display: 'Insurance', category: 'domain', confidence: 0.92 },
  { term: 'healthcare', display: 'Healthcare', category: 'domain', confidence: 0.93 },
  { term: 'e-commerce', display: 'E-Commerce', category: 'domain', confidence: 0.94 },
  { term: 'ecommerce', display: 'E-Commerce', category: 'domain', confidence: 0.93 },
  { term: 'retail', display: 'Retail', category: 'domain', confidence: 0.92 },
  { term: 'manufacturing', display: 'Manufacturing', category: 'domain', confidence: 0.92 },
  { term: 'logistics', display: 'Logistics', category: 'domain', confidence: 0.92 },
  { term: 'supply chain', display: 'Supply Chain', category: 'domain', confidence: 0.93 },
  { term: 'human resources', display: 'HR', category: 'domain', confidence: 0.93 },
  { term: 'hr', display: 'HR', category: 'domain', confidence: 0.87 },
  { term: 'telecom', display: 'Telecom', category: 'domain', confidence: 0.9 },
  { term: 'media', display: 'Media', category: 'domain', confidence: 0.88 },
  { term: 'advertising', display: 'Advertising', category: 'domain', confidence: 0.9 },
  { term: 'real estate', display: 'Real Estate', category: 'domain', confidence: 0.92 },
  { term: 'hospitality', display: 'Hospitality', category: 'domain', confidence: 0.92 },
  { term: 'legal', display: 'Legal', category: 'domain', confidence: 0.9 },
  { term: 'pharma', display: 'Pharma', category: 'domain', confidence: 0.9 },
  { term: 'pharmaceutical', display: 'Pharma', category: 'domain', confidence: 0.9 },
  { term: 'automotive', display: 'Automotive', category: 'domain', confidence: 0.9 },
  { term: 'energy', display: 'Energy', category: 'domain', confidence: 0.88 },
  { term: 'oil and gas', display: 'Oil & Gas', category: 'domain', confidence: 0.92 },
  { term: 'construction', display: 'Construction', category: 'domain', confidence: 0.9 },
  { term: 'agriculture', display: 'Agriculture', category: 'domain', confidence: 0.9 },
  { term: 'fintech', display: 'Fintech', category: 'domain', confidence: 0.93 },
  { term: 'bpo', display: 'BPO', category: 'domain', confidence: 0.92 },
  { term: 'kpo', display: 'KPO', category: 'domain', confidence: 0.9 },
  { term: 'consulting', display: 'Consulting', category: 'domain', confidence: 0.92 },
  { term: 'advisory', display: 'Advisory', category: 'domain', confidence: 0.9 },
  { term: 'sales', display: 'Sales', category: 'domain', confidence: 0.92 },
  { term: 'marketing', display: 'Marketing', category: 'domain', confidence: 0.92 },
  { term: 'digital marketing', display: 'Digital Marketing', category: 'domain', confidence: 0.95 },
  { term: 'seo', display: 'SEO', category: 'domain', confidence: 0.94 },
  { term: 'sem', display: 'SEM', category: 'domain', confidence: 0.93 },
  { term: 'content marketing', display: 'Content Marketing', category: 'domain', confidence: 0.93 },
  { term: 'social media', display: 'Social Media', category: 'domain', confidence: 0.92 },
  { term: 'brand management', display: 'Brand Management', category: 'domain', confidence: 0.92 },
  { term: 'market research', display: 'Market Research', category: 'domain', confidence: 0.92 },
  { term: 'business development', display: 'Business Development', category: 'domain', confidence: 0.93 },
  { term: 'account management', display: 'Account Management', category: 'domain', confidence: 0.92 },
  { term: 'operations', display: 'Operations', category: 'domain', confidence: 0.9 },
  { term: 'project management', display: 'Project Management', category: 'domain', confidence: 0.96 },
  { term: 'program management', display: 'Program Management', category: 'domain', confidence: 0.93 },
  { term: 'product management', display: 'Product Management', category: 'domain', confidence: 0.94 },
  { term: 'investment banking', display: 'Investment Banking', category: 'domain', confidence: 0.94 },
  { term: 'wealth management', display: 'Wealth Management', category: 'domain', confidence: 0.92 },
  { term: 'payroll', display: 'Payroll', category: 'domain', confidence: 0.92 },
  { term: 'treasury', display: 'Treasury', category: 'domain', confidence: 0.9 },
  { term: 'risk management', display: 'Risk Management', category: 'domain', confidence: 0.93 },
  { term: 'business analysis', display: 'Business Analysis', category: 'domain', confidence: 0.94 },
  { term: 'software development', display: 'Software Development', category: 'domain', confidence: 0.93 },
  { term: 'web development', display: 'Web Development', category: 'domain', confidence: 0.93 },
  { term: 'mobile development', display: 'Mobile Development', category: 'domain', confidence: 0.92 },
  { term: 'frontend development', display: 'Frontend Development', category: 'responsibilities', confidence: 0.93 },
  { term: 'backend development', display: 'Backend Development', category: 'responsibilities', confidence: 0.93 },
  { term: 'full stack development', display: 'Full-Stack Development', category: 'domain', confidence: 0.93 },

  // --- Education ---
  { term: 'b.com', display: 'B.Com', category: 'education', confidence: 0.96 },
  { term: 'bachelor of commerce', display: 'B.Com', category: 'education', confidence: 0.96 },
  { term: 'm.com', display: 'M.Com', category: 'education', confidence: 0.95 },
  { term: 'master of commerce', display: 'M.Com', category: 'education', confidence: 0.95 },
  { term: 'bba', display: 'BBA', category: 'education', confidence: 0.96 },
  { term: 'bachelor of business administration', display: 'BBA', category: 'education', confidence: 0.96 },
  { term: 'mba', display: 'MBA', category: 'education', confidence: 0.97 },
  { term: 'master of business administration', display: 'MBA', category: 'education', confidence: 0.97 },
  { term: 'b.tech', display: 'B.Tech', category: 'education', confidence: 0.96 },
  { term: 'b.e.', display: 'B.E.', category: 'education', confidence: 0.95 },
  { term: 'bachelor of engineering', display: 'B.E.', category: 'education', confidence: 0.95 },
  { term: 'm.tech', display: 'M.Tech', category: 'education', confidence: 0.95 },
  { term: 'master of engineering', display: 'M.E.', category: 'education', confidence: 0.94 },
  { term: 'bca', display: 'BCA', category: 'education', confidence: 0.95 },
  { term: 'mca', display: 'MCA', category: 'education', confidence: 0.95 },
  { term: 'b.sc', display: 'B.Sc', category: 'education', confidence: 0.9 },
  { term: 'bsc', display: 'B.Sc', category: 'education', confidence: 0.9 },
  { term: 'bachelor of science', display: 'B.Sc', category: 'education', confidence: 0.93 },
  { term: 'm.sc', display: 'M.Sc', category: 'education', confidence: 0.9 },
  { term: 'msc', display: 'M.Sc', category: 'education', confidence: 0.9 },
  { term: 'master of science', display: 'M.Sc', category: 'education', confidence: 0.93 },
  { term: 'bachelor degree', display: "Bachelor's Degree", category: 'education', confidence: 0.94 },
  { term: "bachelor's degree", display: "Bachelor's Degree", category: 'education', confidence: 0.94 },
  { term: 'master degree', display: "Master's Degree", category: 'education', confidence: 0.93 },
  { term: "master's degree", display: "Master's Degree", category: 'education', confidence: 0.93 },
  { term: 'post graduate', display: 'Post-Graduate', category: 'education', confidence: 0.9 },
  { term: 'postgraduate', display: 'Post-Graduate', category: 'education', confidence: 0.9 },
  { term: 'graduate', display: 'Graduate', category: 'education', confidence: 0.88 },
  { term: 'undergraduate', display: 'Undergraduate', category: 'education', confidence: 0.88 },
  { term: 'diploma', display: 'Diploma', category: 'education', confidence: 0.9 },
  { term: 'phd', display: 'PhD', category: 'education', confidence: 0.95 },
  { term: 'doctorate', display: 'Doctorate', category: 'education', confidence: 0.92 },
  { term: 'intermediate', display: 'Intermediate', category: 'education', confidence: 0.88 },
  { term: '12th', display: '12th', category: 'education', confidence: 0.9 },
  { term: '10th', display: '10th', category: 'education', confidence: 0.9 },
  { term: 'high school', display: 'High School', category: 'education', confidence: 0.88 },
  { term: 'chartered accountancy', display: 'CA', category: 'certificates', confidence: 0.95 },
  { term: 'llb', display: 'LLB', category: 'education', confidence: 0.95 },
  { term: 'b.a.', display: 'B.A.', category: 'education', confidence: 0.88 },
  { term: 'm.a.', display: 'M.A.', category: 'education', confidence: 0.88 },

  // --- Certifications ---
  { term: 'aws certified', display: 'AWS Certified', category: 'certificates', confidence: 0.95 },
  { term: 'aws solution architect', display: 'AWS Solutions Architect', category: 'certificates', confidence: 0.96 },
  { term: 'azure certified', display: 'Azure Certified', category: 'certificates', confidence: 0.94 },
  { term: 'google cloud certified', display: 'Google Cloud Certified', category: 'certificates', confidence: 0.94 },
  { term: 'pmp', display: 'PMP', category: 'certificates', confidence: 0.95 },
  { term: 'pmp certification', display: 'PMP', category: 'certificates', confidence: 0.94 },
  { term: 'prince2', display: 'PRINCE2', category: 'certificates', confidence: 0.93 },
  { term: 'cpa', display: 'CPA', category: 'certificates', confidence: 0.94 },
  { term: 'certified public accountant', display: 'CPA', category: 'certificates', confidence: 0.96 },
  { term: 'cfa', display: 'CFA', category: 'certificates', confidence: 0.94 },
  { term: 'chartered financial analyst', display: 'CFA', category: 'certificates', confidence: 0.95 },
  { term: 'ccna', display: 'CCNA', category: 'certificates', confidence: 0.94 },
  { term: 'ccnp', display: 'CCNP', category: 'certificates', confidence: 0.94 },
  { term: 'ccie', display: 'CCIE', category: 'certificates', confidence: 0.94 },
  { term: 'rhce', display: 'RHCE', category: 'certificates', confidence: 0.93 },
  { term: 'rhcsa', display: 'RHCSA', category: 'certificates', confidence: 0.93 },
  { term: 'comptia', display: 'CompTIA', category: 'certificates', confidence: 0.92 },
  { term: 'itil', display: 'ITIL', category: 'certificates', confidence: 0.93 },
  { term: 'six sigma', display: 'Six Sigma', category: 'certificates', confidence: 0.93 },
  { term: 'lean six sigma', display: 'Lean Six Sigma', category: 'certificates', confidence: 0.94 },
  { term: 'black belt', display: 'Black Belt', category: 'certificates', confidence: 0.92 },
  { term: 'green belt', display: 'Green Belt', category: 'certificates', confidence: 0.92 },
  { term: 'certified ethical hacker', display: 'CEH', category: 'certificates', confidence: 0.95 },
  { term: 'oscp', display: 'OSCP', category: 'certificates', confidence: 0.94 },
  { term: 'scrum master', display: 'Scrum Master', category: 'certificates', confidence: 0.94 },
  { term: 'csm', display: 'CSM', category: 'certificates', confidence: 0.9 },
  { term: 'psm', display: 'PSM', category: 'certificates', confidence: 0.9 },
  { term: 'ca', display: 'CA', category: 'certificates', confidence: 0.92 },
  { term: 'cs', display: 'CS', category: 'certificates', confidence: 0.88 },
  { term: 'cma', display: 'CMA', category: 'certificates', confidence: 0.88 },
  { term: 'certified management accountant', display: 'CMA', category: 'certificates', confidence: 0.94 },
  { term: 'company secretary', display: 'CS', category: 'certificates', confidence: 0.92 },
  { term: 'sap certified', display: 'SAP Certified', category: 'certificates', confidence: 0.93 },
  { term: 'quickbooks certified', display: 'QuickBooks Certified', category: 'certificates', confidence: 0.93 },
  { term: 'istqb', display: 'ISTQB', category: 'certificates', confidence: 0.93 },

  // --- Responsibilities ---
  { term: 'dashboard development', display: 'Dashboard Development', category: 'responsibilities', confidence: 0.93 },
  { term: 'report generation', display: 'Report Generation', category: 'responsibilities', confidence: 0.92 },
  { term: 'financial reporting', display: 'Financial Reporting', category: 'responsibilities', confidence: 0.94 },
  { term: 'mis reporting', display: 'MIS Reporting', category: 'responsibilities', confidence: 0.93 },
  { term: 'budgeting', display: 'Budgeting', category: 'responsibilities', confidence: 0.92 },
  { term: 'forecasting', display: 'Forecasting', category: 'responsibilities', confidence: 0.9 },
  { term: 'variance analysis', display: 'Variance Analysis', category: 'responsibilities', confidence: 0.92 },
  { term: 'bookkeeping', display: 'Bookkeeping', category: 'responsibilities', confidence: 0.93 },
  { term: 'ledger posting', display: 'Ledger Posting', category: 'responsibilities', confidence: 0.92 },
  { term: 'reconciliation', display: 'Reconciliation', category: 'responsibilities', confidence: 0.92 },
  { term: 'account reconciliation', display: 'Reconciliation', category: 'responsibilities', confidence: 0.91 },
  { term: 'invoice processing', display: 'Invoice Processing', category: 'responsibilities', confidence: 0.92 },
  { term: 'billing', display: 'Billing', category: 'responsibilities', confidence: 0.9 },
  { term: 'invoicing', display: 'Invoicing', category: 'responsibilities', confidence: 0.91 },
  { term: 'payroll processing', display: 'Payroll Processing', category: 'responsibilities', confidence: 0.92 },
  { term: 'tax filing', display: 'Tax Filing', category: 'responsibilities', confidence: 0.9 },
  { term: 'gst filing', display: 'GST Filing', category: 'responsibilities', confidence: 0.93 },
  { term: 'tds return', display: 'TDS Return', category: 'responsibilities', confidence: 0.93 },
  { term: 'vendor management', display: 'Vendor Management', category: 'responsibilities', confidence: 0.92 },
  { term: 'requirement gathering', display: 'Requirement Gathering', category: 'responsibilities', confidence: 0.91 },
  { term: 'data cleaning', display: 'Data Cleaning', category: 'responsibilities', confidence: 0.91 },
  { term: 'data modeling', display: 'Data Modeling', category: 'responsibilities', confidence: 0.92 },
  { term: 'feature engineering', display: 'Feature Engineering', category: 'responsibilities', confidence: 0.92 },
  { term: 'model training', display: 'Model Training', category: 'responsibilities', confidence: 0.91 },
  { term: 'model deployment', display: 'Model Deployment', category: 'responsibilities', confidence: 0.92 },
  { term: 'api development', display: 'API Development', category: 'responsibilities', confidence: 0.93 },
  { term: 'ui/ux design', display: 'UI/UX Design', category: 'responsibilities', confidence: 0.93 },
  { term: 'ui design', display: 'UI Design', category: 'responsibilities', confidence: 0.91 },
  { term: 'ux design', display: 'UX Design', category: 'responsibilities', confidence: 0.91 },
  { term: 'wireframing', display: 'Wireframing', category: 'responsibilities', confidence: 0.9 },
  { term: 'prototyping', display: 'Prototyping', category: 'responsibilities', confidence: 0.9 },
  { term: 'test automation', display: 'Test Automation', category: 'responsibilities', confidence: 0.92 },
  { term: 'automated testing', display: 'Automated Testing', category: 'responsibilities', confidence: 0.92 },
  { term: 'deployment', display: 'Deployment', category: 'responsibilities', confidence: 0.9 },
  { term: 'monitoring', display: 'Monitoring', category: 'responsibilities', confidence: 0.87 },
  { term: 'incident management', display: 'Incident Management', category: 'responsibilities', confidence: 0.9 },
  { term: 'code review', display: 'Code Review', category: 'responsibilities', confidence: 0.9 },
  { term: 'sprint planning', display: 'Sprint Planning', category: 'responsibilities', confidence: 0.9 },
  { term: 'recruitment', display: 'Recruitment', category: 'responsibilities', confidence: 0.92 },
  { term: 'onboarding', display: 'Onboarding', category: 'responsibilities', confidence: 0.9 },
  { term: 'employee engagement', display: 'Employee Engagement', category: 'responsibilities', confidence: 0.9 },
  { term: 'training', display: 'Training', category: 'responsibilities', confidence: 0.87 },
  { term: 'cold calling', display: 'Cold Calling', category: 'responsibilities', confidence: 0.9 },
  { term: 'lead generation', display: 'Lead Generation', category: 'responsibilities', confidence: 0.92 },
  { term: 'product demos', display: 'Product Demos', category: 'responsibilities', confidence: 0.88 },
  { term: 'proposals', display: 'Proposals', category: 'responsibilities', confidence: 0.88 },
  { term: 'contract management', display: 'Contract Management', category: 'responsibilities', confidence: 0.9 },
  { term: 'procurement', display: 'Procurement', category: 'responsibilities', confidence: 0.9 },
  { term: 'inventory management', display: 'Inventory Management', category: 'responsibilities', confidence: 0.92 },
  { term: 'warehouse operations', display: 'Warehouse Operations', category: 'responsibilities', confidence: 0.9 },
  { term: 'quality assurance', display: 'Quality Assurance', category: 'responsibilities', confidence: 0.91 },
  { term: 'data entry', display: 'Data Entry', category: 'responsibilities', confidence: 0.9 },
  { term: 'documentation', display: 'Documentation', category: 'responsibilities', confidence: 0.85 },
  { term: 'reporting', display: 'Reporting', category: 'responsibilities', confidence: 0.86 },
  { term: 'analysing data', display: 'Data Analysis', category: 'responsibilities', confidence: 0.9 },
  { term: 'analyzing data', display: 'Data Analysis', category: 'responsibilities', confidence: 0.9 },
  { term: 'building dashboards', display: 'Dashboard Development', category: 'responsibilities', confidence: 0.93 },
  { term: 'creating dashboards', display: 'Dashboard Development', category: 'responsibilities', confidence: 0.93 },

  // --- Experience ---
  { term: 'fresher', display: 'Fresher', category: 'experience', confidence: 0.92 },
  { term: 'internship', display: 'Internship', category: 'experience', confidence: 0.92 },
  { term: 'intern', display: 'Internship', category: 'experience', confidence: 0.88 },
  { term: 'internships', display: 'Internship', category: 'experience', confidence: 0.92 },
  { term: 'entry level', display: 'Entry Level', category: 'experience', confidence: 0.9 },
  { term: 'mid level', display: 'Mid-Level', category: 'experience', confidence: 0.9 },
  { term: 'senior level', display: 'Senior-Level', category: 'experience', confidence: 0.9 },

  // --- Other ---
  { term: 'immediate joiner', display: 'Immediate Joiner', category: 'other', confidence: 0.93 },
  { term: 'immediate availability', display: 'Immediate Availability', category: 'other', confidence: 0.92 },
  { term: 'notice period', display: 'Notice Period', category: 'other', confidence: 0.91 },
  { term: 'relocation', display: 'Relocation', category: 'other', confidence: 0.9 },
  { term: 'willing to relocate', display: 'Willing to Relocate', category: 'other', confidence: 0.92 },
  { term: 'work from office', display: 'Work From Office', category: 'other', confidence: 0.92 },
  { term: 'work from home', display: 'Work From Home', category: 'other', confidence: 0.92 },
  { term: 'hybrid', display: 'Hybrid Work', category: 'other', confidence: 0.88 },
  { term: 'remote', display: 'Remote Work', category: 'other', confidence: 0.88 },
  { term: 'night shift', display: 'Night Shift', category: 'other', confidence: 0.91 },
  { term: 'shift availability', display: 'Shift Availability', category: 'other', confidence: 0.9 },
  { term: 'fluent english', display: 'Fluent English', category: 'other', confidence: 0.93 },
  { term: 'spoken english', display: 'Spoken English', category: 'other', confidence: 0.91 },
  { term: 'written english', display: 'Written English', category: 'other', confidence: 0.9 },
  { term: 'english', display: 'English', category: 'other', confidence: 0.85 },
  { term: 'hindi', display: 'Hindi', category: 'other', confidence: 0.88 },
  { term: 'marathi', display: 'Marathi', category: 'other', confidence: 0.88 },
  { term: 'driving license', display: 'Driving License', category: 'other', confidence: 0.91 },
  { term: 'valid driver license', display: 'Driving License', category: 'other', confidence: 0.92 },
  { term: 'passport', display: 'Passport', category: 'other', confidence: 0.88 },
  { term: 'background verification', display: 'Background Verification', category: 'other', confidence: 0.88 },
];

// ---------------------------------------------------------------
// Aliases & normalization. Every alias resolves to a KB term key.
// ---------------------------------------------------------------

const ALIASES = {
  // Excel / Office
  'excel': 'microsoft excel',
  'ms excel': 'microsoft excel',
  'advanced excel': 'microsoft excel',
  'excel pivot': 'microsoft excel',
  'pivot tables': 'microsoft excel',
  'ms office': 'microsoft office',
  'office suite': 'microsoft office',
  'ms word': 'microsoft word',
  'ms powerpoint': 'microsoft powerpoint',
  'ms outlook': 'microsoft outlook',
  'msexcel': 'microsoft excel',
  'msaccess': 'microsoft access',
  // BI tools
  'powerbi': 'power bi',
  'power bi desktop': 'power bi',
  'tableau desktop': 'tableau',
  'qlik': 'tableau',
  // Languages / frameworks
  'py': 'python',
  'python3': 'python',
  'java script': 'javascript',
  'js': 'javascript',
  'es6': 'javascript',
  'ts': 'typescript',
  'reactjs': 'react js',
  'react.js': 'react js',
  'nodejs': 'node js',
  'node.js': 'node js',
  'nextjs': 'next js',
  'next.js': 'next js',
  'vuejs': 'vue js',
  'expressjs': 'express js',
  'express.js': 'express js',
  'nestjs': 'nest js',
  'csharp': 'c#',
  'c sharp': 'c#',
  'cpp': 'c++',
  'dotnet': '.net',
  'dot net': '.net',
  '.net core': '.net',
  'aspdotnet': 'asp.net',
  // DB / infra / data
  'postgres': 'postgresql',
  'mongo': 'mongodb',
  'sqlserver': 'microsoft sql server',
  'sql server': 'microsoft sql server',
  'k8s': 'kubernetes',
  'ci cd': 'ci/cd',
  'c ide': 'ci/cd',
  'g cp': 'google cloud',
  'spark sql': 'apache spark',
  'pyspark': 'apache spark',
  'kafka topic': 'apache kafka',
  // ML / AI
  'ml': 'machine learning',
  'machine learning models': 'machine learning',
  'ai': 'artificial intelligence',
  'ai/ml': 'machine learning',
  'nlp': 'natural language processing',
  'natuaral language processing': 'natural language processing',
  'dl': 'deep learning',
  'llm': 'machine learning',
  'sklearn': 'scikit-learn',
  'sk learn': 'scikit-learn',
  'data-visualisation': 'data visualization',
  'visualization': 'data visualization',
  'visualisation': 'data visualization',
  'tableau 10': 'tableau',
  'power pivot': 'microsoft excel',
  // Tally / accounting
  'tallyprime': 'tally',
  'tally prime': 'tally',
  'tally erp': 'tally',
  'tally erp9': 'tally',
  'tally 9': 'tally',
  'quick books': 'quickbooks',
  'sap erp 6': 'sap erp',
  // Reporting / duties
  'mis': 'mis reporting',
  'mis report': 'mis reporting',
  'accounts payable': 'accounting',
  'accounts receivable': 'accounting',
  'ap': 'accounting',
  'ar': 'accounting',
  'ms office excel': 'microsoft excel',
  'financial statement': 'financial reporting',
  'financial statements': 'financial reporting',
  'bank reconciliation': 'reconciliation',
  'daily reports': 'reporting',
  // Soft skills multi-spell
  'communication skill': 'communication',
  'communication skills': 'communication skills',
  'problem-solving': 'problem solving',
  'problem solving skills': 'problem solving',
  'decision-making': 'decision making',
  'time-management': 'time management',
  'stakeholder-management': 'stakeholder management',
  'attention-to-detail': 'attention to detail',
  'detail-oriented': 'detail oriented',
  'self-motivation': 'self-motivated',
  'open-mindedness': 'open-minded',
  'emotional quotient': 'emotional intelligence',
  'cq': 'emotional intelligence',
  'people skills': 'interpersonal skills',
  'interpersonal': 'interpersonal skills',
  // Domains
  'e commerce': 'e-commerce',
  'ecom': 'e-commerce',
  'supplychain': 'supply chain',
  'human resource': 'human resources',
  'digitalmarketing': 'digital marketing',
  'project mgmt': 'project management',
  'project management': 'project management',
  'data analyst': 'data analysis',
  'data-entry': 'data entry',
  // Education
  'bcom': 'b.com',
  'mcom': 'm.com',
  'btech': 'b.tech',
  'mtech': 'm.tech',
  'bsc.': 'b.sc',
  'msc.': 'm.sc',
  'bachelors degree': 'bachelor degree',
  'bachelors': 'bachelor degree',
  'masters degree': 'master degree',
  'masters': 'master degree',
  'graduate degree': 'bachelor degree',
  'highschool': 'high school',
  'inter': 'intermediate',
  '12th standard': '12th',
  'hsc': '12th',
  'ssc': '10th',
  // Hyphenated forms
  'data-analysis': 'data analysis',
  'data-engineering': 'data engineering',
  'data-science': 'data science',
  'machine-learning': 'machine learning',
  'deep-learning': 'deep learning',
  'computer-vision': 'computer vision',
  'statistical-analysis': 'statistical analysis',
  'project-management': 'project management',
  'business-analysis': 'business analysis',
  'risk-management': 'risk management',
  'supply-chain': 'supply chain',
  'business-development': 'business development',
  'digital-marketing': 'digital marketing',
  'content-marketing': 'content marketing',
  'social-media': 'social media',
  'brand-management': 'brand management',
  'market-research': 'market research',
  'account-management': 'account management',
  'investment-banking': 'investment banking',
  'wealth-management': 'wealth management',
  'financial-reporting': 'financial reporting',
  'variance-analysis': 'variance analysis',
  'invoice-processing': 'invoice processing',
  'payroll-processing': 'payroll processing',
  'gst-filing': 'gst filing',
  'gst-filings': 'gst filing',
  'gst returns': 'gst filing',
  'gst return': 'gst filing',
  'microsoft-excel': 'microsoft excel',
  'power-bi': 'power bi',
  'google-analytics': 'google analytics',
  'machine-learning-engineers': 'machine learning',
  'communication-protocol': '__soft_negative__',
  'report-generation': 'report generation',
  'dashboard-development': 'dashboard development',
  'requirement-gathering': 'requirement gathering',
  'data-cleaning': 'data cleaning',
  'data-modeling': 'data modeling',
  'feature-engineering': 'feature engineering',
  'model-training': 'model training',
  'model-deployment': 'model deployment',
  'api-development': 'api development',
  'test-automation': 'test automation',
  'incident-management': 'incident management',
  'sprint-planning': 'sprint planning',
  'employee-engagement': 'employee engagement',
  'lead-generation': 'lead generation',
  'contract-management': 'contract management',
  'inventory-management': 'inventory management',
  'quality-assurance': 'quality assurance',
  'ui-ux': 'ui/ux design',
  'front-end': 'frontend development',
  'back-end': 'backend development',
  'full-stack': 'full stack development',
  'customer-service': 'customer service',
};

// ---------------------------------------------------------------
// Maps built once at load time.
// ---------------------------------------------------------------

const TERM_MAP = new Map();
const ALIAS_MAP = new Map();
const CATEGORY_ORDER = ['technical', 'tools', 'soft', 'domain', 'certificates', 'education', 'experience', 'responsibilities', 'other'];

for (const ent of KB) {
  if (!TERM_MAP.has(ent.term)) TERM_MAP.set(ent.term, ent);
}
for (const [alias, canonical] of Object.entries(ALIASES)) {
  if (canonical === '__soft_negative__') continue;
  if (!ALIAS_MAP.has(alias)) ALIAS_MAP.set(alias, canonical);
}

const MAX_PHRASE_WORDS = 5;
const MAX_EXTRACTED = 200;

// ---------------------------------------------------------------
// Normalization — collapse punctuation to separators while keeping
// the characters that matter inside skill tokens (+, #, ., -).
// ---------------------------------------------------------------

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9+#.\-\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveKey(phrase) {
  if (TERM_MAP.has(phrase)) return phrase;
  const viaAlias = ALIAS_MAP.get(phrase);
  return viaAlias || null;
}

// ---------------------------------------------------------------
// Contextual rules.
// ---------------------------------------------------------------

const SOFT_NEGATIVE_CONTEXT = [
  /protocol/i, /interface/i, /bus\b/i, /\bserial\b/i, /\bwireless\b/i,
  /\brf\b/i, /\btcp/i, /\budp/i, /latency/i, /bandwidth/i, /signal/i,
  /\bmodule\b/i, /\bbus\b/i, /\bencoded/i,
];

const PREFERRED_HINTS = /(nice to have|good to have|preferred|desired|bonus|plus|advantage|a plus)/i;
const REQUIRED_HINTS = /(must have|essential|required|mandatory|minimum requirement|must possess)/i;
const STRONG_HINTS = /(strong|excellent|expert|advanced|mastery|proficient|deep|extensive|solid)/i;
const WEAK_HINTS = /(basic|familiar|exposure|awareness|introductory|beginner)/i;

// Sentence boundaries so "Preferred: X" in one sentence cannot bleed
// into "Required: Y" in another. Boundaries are detected on the RAW
// normalized tokens (before trailing-dot stripping): a token counts as
// a boundary when it ENDS with ., ;, ! or ? (so "b.tech." breaks, "c#" and
// "b.tech" do not) and is detected with /[.;!?]+$/.

function sentenceRanges(tokens, isBoundary = []) {
  const starts = [0];
  for (let i = 0; i < tokens.length; i++) {
    if (isBoundary[i]) starts.push(i + 1);
  }
  starts.push(tokens.length);
  return starts;
}

function rangeStart(tokens, ranges, tokenIndex) {
  let lo = 0;
  for (let k = 0; k < ranges.length - 1; k++) {
    if (ranges[k] <= tokenIndex && tokenIndex < ranges[k + 1]) {
      lo = ranges[k];
      break;
    }
  }
  return lo;
}

function sentenceFor(tokens, ranges, tokenIndex) {
  const lo = rangeStart(tokens, ranges, tokenIndex);
  const hi = ranges.find((s) => s > lo) || tokens.length;
  const ctx = tokens.slice(lo, hi).join(' ');
  return ctx.length ? ctx : ' ';
}

// Position-aware mode detection: use the nearest heading word that appears
// BEFORE the term in the same sentence ("Required: X, Preferred: Y").
function modeMarkerAt(tokens, ranges, tokenIndex) {
  const lo = rangeStart(tokens, ranges, tokenIndex);
  let best = null;
  for (let j = lo; j <= tokenIndex; j++) {
    const w = tokens[j];
    let mode = null;
    if (w === 'required' || w === 'must' || w === 'essential' || w === 'mandatory') mode = 'required';
    else if (w === 'preferred' || w === 'desired' || w === 'bonus' || w === 'plus' || w === 'advantage') mode = 'preferred';
    else if (w === 'nice' && tokens[j + 1] === 'to' && tokens[j + 2] === 'have') mode = 'preferred';
    else if (w === 'good' && tokens[j + 1] === 'to' && tokens[j + 2] === 'have') mode = 'preferred';
    if (mode) best = { pos: j, mode };
  }
  return best ? best.mode : null;
}

function isNegated(ent, context) {
  if (ent.category !== 'soft') return false;
  return SOFT_NEGATIVE_CONTEXT.some((re) => re.test(context));
}

const REQUIRED_HEADER = /(qualifications required|requirements?|must have|essential|mandatory|minimum (requirement|qualifications))/i;
const PREFERRED_HEADER = /(preferred|nice to have|good to have|desired|bonus points|would be great|plus)/i;
const RESPONSIBILITIES_HEADER = /(responsibilities|roles and responsibilities|what you('| )?ll do|duties|key accountabilities)/i;

function adjustConfidence(ent, context) {
  let c = ent.confidence;
  if (STRONG_HINTS.test(context)) c += 0.02;
  if (WEAK_HINTS.test(context)) c -= 0.06;
  if (PREFERRED_HINTS.test(context)) c -= 0.02;
  if (REQUIRED_HINTS.test(context)) c += 0.02;
  c = Math.max(0.05, Math.min(0.99, c));
  return Math.round(c * 100) / 100;
}

// ---------------------------------------------------------------
// Experience extraction (regex-based structural signals).
// ---------------------------------------------------------------

const EXPERIENCE_RE = /(\d{1,2})\s*[-+]\s*(\d{1,2})\s*(?:years?|yrs)|(\d{1,2})\s*\+?\s*(?:years?|yrs|yr)/g;

function extractExperience(normText, sectionMode = 'required') {
  const out = [];
  const seen = new Set();
  let m;
  while ((m = EXPERIENCE_RE.exec(normText)) !== null && out.length < 6) {
    let display = null;
    if (m[1] && m[2]) display = `${m[1]}-${m[2]} years`;
    else if (m[3]) display = `${m[3]}+ years`;
    else if (/fresh/i.test(normText.slice(Math.max(0, EXPERIENCE_RE.lastIndex - 12), EXPERIENCE_RE.lastIndex + 12))) display = 'Fresher';
    if (display && !seen.has(display)) {
      seen.add(display);
      out.push({ term: display, display, category: 'experience', confidence: 0.9, raw: m[0], mode: sectionMode });
    }
  }
  return out;
}

// ---------------------------------------------------------------
// Core: phrase-level entity extraction (5-word ... 1-word).
// ---------------------------------------------------------------

function extractEntities(text, { sectionMode = 'required' } = {}) {
  const norm = normalize(text);
  if (!norm) return [];
  const rawTokens = norm.split(' ');
  const tokens = [];
  const isBoundary = [];
  for (const rt of rawTokens) {
    let c = rt.replace(/\.+$/g, '');
    c = c.replace(/\.{2,}/g, '.');
    if (!c) continue;
    tokens.push(c);
    isBoundary.push(/[.;!?]+$/.test(rt));
  }
  const ranges = sentenceRanges(tokens, isBoundary);
  let used = new Array(tokens.length).fill(false);
  const out = [];
  const maxLen = Math.min(MAX_PHRASE_WORDS, tokens.length);

  for (let n = maxLen; n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if (used[i] || used.slice(i, i + n).some(Boolean)) continue;
      const phrase = tokens.slice(i, i + n).join(' ');
      const key = resolveKey(phrase);
      if (!key) continue;
      const ent = TERM_MAP.get(key);
      if (!ent) continue;
      const context = sentenceFor(tokens, ranges, i);
      if (isNegated(ent, context)) continue;
      for (let k = i; k < i + n; k++) used[k] = true;
      const mode = modeMarkerAt(tokens, ranges, i) || sectionMode;
      out.push({
        term: key,
        display: ent.display,
        category: ent.category,
        confidence: adjustConfidence(ent, context),
        mode,
        context: context.slice(0, 160),
      });
      i += n - 1;
      if (out.length >= MAX_EXTRACTED) return out;
    }
  }

  const extras = extractExperience(norm, sectionMode);
  out.push(...extras);
  return out;
}

// ---------------------------------------------------------------
// JD segmentation: split text into required/preferred regions.
// ---------------------------------------------------------------

function segmentJD(jdText) {
  const paragraphs = String(jdText || '')
    .split(/\r?\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const groups = [];
  let mode = 'required';
  for (const para of paragraphs) {
    const low = para.toLowerCase();
    if (PREFERRED_HEADER.test(low) && para.length < 60) mode = 'preferred';
    else if (REQUIRED_HEADER.test(low) && para.length < 60) mode = 'required';
    else if (RESPONSIBILITIES_HEADER.test(low) && para.length < 60) mode = 'required';
    groups.push({ mode, text: para });
  }
  return groups;
}

// ---------------------------------------------------------------
// Public pipeline helpers.
// ---------------------------------------------------------------

function extractStructured(text, opts = {}) {
  const segs = opts.jd ? segmentJD(text) : [{ mode: 'required', text }];
  const gathered = [];
  for (const seg of segs) {
    const ents = extractEntities(seg.text, { sectionMode: seg.mode });
    for (const e of ents) {
      const existing = gathered.find((g) => g.term === e.term);
      if (!existing) {
        gathered.push(e);
        continue;
      }
      // Keep highest-confidence instance; prefer "required" mode when duplicated.
      const eScore = e.confidence + (e.mode === 'required' ? 0.05 : 0);
      const xScore = existing.confidence + (existing.mode === 'required' ? 0.05 : 0);
      if (eScore > xScore) Object.assign(existing, e);
    }
  }
  return gathered;
}

// ---------------------------------------------------------------
// Legacy-friendly surface.
// extractKeywords / extractHiringSignals -> array of display names (lowercased)
// ---------------------------------------------------------------

function extractKeywords(text) {
  const ents = extractStructured(text, { jd: false });
  return ents.map((e) => e.display.toLowerCase());
}

function extractHiringSignals(text) {
  return extractKeywords(text);
}

function extractJDSections(text) {
  const ents = extractStructured(text, { jd: true });
  const cats = { skills: [], education: [], experience: [], tools: [], soft: [] };
  for (const e of ents) {
    const c = e.category;
    if (c === 'technical') cats.skills.push(e.display);
    else if (c === 'education') cats.education.push(e.display);
    else if (c === 'experience') cats.experience.push(e.display);
    else if (c === 'tools') cats.tools.push(e.display);
    else if (c === 'soft') cats.soft.push(e.display);
  }
  return cats;
}

// ---------------------------------------------------------------
// Candidate profile from a resume: canonical term -> best evidence.
// ---------------------------------------------------------------

function extractCandidateProfile(resumeText) {
  const ents = extractStructured(resumeText, { jd: false });
  const byTerm = new Map();
  for (const e of ents) {
    const existing = byTerm.get(e.term);
    if (!existing || e.confidence > existing.confidence) byTerm.set(e.term, e);
  }
  return byTerm;
}

// ---------------------------------------------------------------
// Match: JD (required + preferred) vs resume, category by category.
// ---------------------------------------------------------------

function initCategory(cats, cat) {
  if (!cats[cat]) {
    cats[cat] = {
      title: CATEGORY_LABELS[cat] || cat,
      required: [],
      matched: [],
      missing: [],
      preferred: [],
      preferredMatched: [],
      preferredMissing: [],
      detail: [],
    };
  }
  return cats[cat];
}

function matchResumeToJD(jdText, resumeText) {
  const jdRequired = extractStructured(jdText, { jd: true }).filter((e) => e.mode === 'required');
  const jdPreferred = extractStructured(jdText, { jd: true }).filter((e) => e.mode === 'preferred');
  const resumeProfile = extractCandidateProfile(resumeText);

  const isMatched = (re) => resumeProfile.has(re.term);
  const displayByName = (name) => resumeProfile.get(name) ? resumeProfile.get(name).display : name;

  const matched = [];
  const missing = [];
  const preferredMatched = [];
  const preferredMissing = [];
  const categories = {};

  for (const re of jdRequired) {
    const cat = initCategory(categories, re.category);
    cat.required.push(re.display);
    if (isMatched(re)) {
      cat.matched.push(re.display);
      matched.push(re.display);
    } else {
      cat.missing.push(re.display);
      missing.push(re.display);
    }
    cat.detail.push({
      name: re.display,
      category: re.category,
      mode: re.mode,
      status: isMatched(re) ? 'match' : 'missing',
      confidence: re.confidence,
      resumeMatch: isMatched(re) ? resumeProfile.get(re.term).display : null,
    });
  }

  for (const re of jdPreferred) {
    const cat = initCategory(categories, re.category);
    cat.preferred.push(re.display);
    if (isMatched(re)) {
      cat.preferredMatched.push(re.display);
      preferredMatched.push(re.display);
    } else {
      cat.preferredMissing.push(re.display);
      preferredMissing.push(re.display);
    }
    cat.detail.push({
      name: re.display,
      category: re.category,
      mode: re.mode,
      status: isMatched(re) ? 'match' : 'missing',
      confidence: re.confidence,
      resumeMatch: isMatched(re) ? resumeProfile.get(re.term).display : null,
    });
  }

  const totalRequired = matched.length + missing.length;
  const pct = totalRequired ? Math.round((matched.length / totalRequired) * 100) : 0;
  const jdEntities = extractStructured(jdText, { jd: true });

  return {
    pct,
    matched,
    missing,
    jdKeywords: jdEntities.map((e) => e.display),
    jdSignals: jdEntities.map((e) => e.display),
    hiringSignals: jdEntities.map((e) => e.display),
    categories,
    preferred: { matched: preferredMatched, missing: preferredMissing },
    overall: {
      requiredMatched: matched.length,
      requiredMissing: missing.length,
      preferredMatched: preferredMatched.length,
      preferredMissing: preferredMissing.length,
      totalRequired,
    },
    engine: 'structured-v2',
  };
}

module.exports = {
  extractKeywords,
  extractHiringSignals,
  extractJDSections,
  extractEntities,
  extractStructured,
  extractCandidateProfile,
  matchResumeToJD,
  segmentJD,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  HIRING_VOCAB: new Set(KB.map((e) => e.term)),
  HIRING_PHRASES: KB.filter((e) => e.term.includes(' ')).map((e) => e.display),
};