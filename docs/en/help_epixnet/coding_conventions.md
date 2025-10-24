# Coding standards if you want to collaborate to EpixNet
 - Follow [PEP8](https://www.python.org/dev/peps/pep-0008/)
 - Simple is better than complex
 - Premature optimization is the root of all evil

### Naming
 - ClassNames: Capitalized, CamelCased
 - functionNames: starts with lowercase, camelCased
 - variable_names: lowercased, under_scored

### Variables
 - file_path: File path realtive to working dir (data/epix17lzwytj4kddedrx9qyvt5743ug74e5q7l6qpkq/css/all.css)
 - inner_path: File relative to site dir (css/all.css)
 - file_name: all.css
 - file: Python file object
 - privatekey: Private key for the site (without _)

### Source files directories and naming
 - One class per file is preferred
 - Source file name and directory comes from ClassName: WorkerManager class = Worker/WorkerManager.py
