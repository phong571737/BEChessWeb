Luật giao tiếp lập trình tiết kiệm token

1. Không tự ý sử dụng các tool để build firmware, flash firmware hoặc chạy test.
   - Chỉ thực hiện khi người dùng yêu cầu.
   - Nếu cần build để kiểm tra, hãy hỏi trước.

2. Không tự ý đọc toàn bộ project.
   - Chỉ đọc các file liên quan trực tiếp đến yêu cầu.
   - Không scan recursive nếu chưa được yêu cầu.

3. Không tự ý mở các file lớn.
   - Chỉ đọc phần cần thiết.
   - Ưu tiên đọc theo dòng, symbol hoặc function.

4. Không giải thích dài dòng.
   - Trả lời ngắn gọn.
   - Chỉ giải thích chi tiết khi được yêu cầu.

5. Không lặp lại nội dung đã trao đổi.
   - Chỉ cung cấp thông tin mới.

6. Không tự ý refactor hoặc format code ngoài phạm vi yêu cầu.

7. Không tạo file mới nếu có thể chỉnh sửa file hiện có.

8. Không tự ý cài package, update dependency hoặc thay đổi môi trường.

9. Không chạy benchmark, lint, unit test hoặc integration test nếu chưa được yêu cầu.

10. Khi chỉnh sửa code:
    - Chỉ sửa đúng phần cần thiết.
    - Giữ nguyên style và cấu trúc hiện có.

11. Không đưa ra nhiều phương án.
    - Chọn phương án hợp lý nhất.
    - Chỉ liệt kê các lựa chọn khi người dùng yêu cầu so sánh.

12. Không tự suy đoán yêu cầu.
    - Nếu thông tin chưa đủ để thực hiện, hãy hỏi một câu ngắn gọn.

13. Không sinh code mẫu hoặc ví dụ khi người dùng chỉ hỏi lý thuyết.

14. Không lặp lại toàn bộ đoạn code.
    - Chỉ trả về phần thay đổi hoặc diff nếu có thể.

15. Không in log, output hoặc stack trace đầy đủ nếu không cần.
    - Chỉ trích phần liên quan đến lỗi.

16. Ưu tiên câu trả lời dưới 200 từ đối với câu hỏi thông thường.

17. Khi sử dụng tool:
    - Chỉ gọi tool tối thiểu cần thiết.
    - Không gọi nhiều tool để xác minh cùng một thông tin.

18. Nếu độ tin cậy dưới 90%, hãy hỏi người dùng thay vì suy đoán.

19. Không tự ý commit, push hoặc merge code.

20. Mặc định ưu tiên tối ưu token hơn tối ưu tính đầy đủ.
    - Chỉ mở rộng nội dung khi người dùng yêu cầu.