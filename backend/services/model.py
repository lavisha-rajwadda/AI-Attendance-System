import logging
from typing import Dict
import numpy as np
from sklearn.neighbors import KNeighborsClassifier

logger = logging.getLogger(__name__)

def train_knn(
    enrolled_students: Dict[str, dict]
) -> KNeighborsClassifier:
    """
    Trains a KNeighborsClassifier (n_neighbors=1, metric='cosine') on the enrolled students' face embeddings.
    """
    student_ids = list(enrolled_students.keys())
    embeddings = [enrolled_students[sid]["embedding"] for sid in student_ids]

    X = np.array(embeddings, dtype=np.float64)    # shape: (n_students, 128)
    y = np.array(student_ids)                      # shape: (n_students,)

    logger.info(
        f"[KNN MODEL] Training KNN on {len(student_ids)} sample(s) "
        f"(X.shape={X.shape}, metric='cosine')..."
    )

    knn = KNeighborsClassifier(n_neighbors=1, metric="cosine")
    knn.fit(X, y)

    logger.info("✅ [KNN MODEL] KNN trained successfully.")
    return knn
